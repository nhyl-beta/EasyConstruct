import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { logger, SLOW_REQUEST_MS } from "./logger.js";
import { noteCache, noteTiming } from "./request-context.js";

const withServer = async <T>(fn: (base: string) => Promise<T>): Promise<T> => {
  const app = express();
  app.use(logger);
  app.get("/fast", (_req, res) => res.json({ ok: true }));
  app.get("/cached/:id", async (_req, res) => {
    await Promise.resolve();
    noteCache("HIT");
    noteTiming("db", 3.2);
    res.json({ ok: true });
  });
  app.get("/mixed", (_req, res) => {
    noteCache("HIT");
    noteCache("MISS");
    noteCache("HIT");
    res.json({ ok: true });
  });
  app.get("/slow", async (_req, res) => {
    await new Promise((r) => setTimeout(r, SLOW_REQUEST_MS + 40));
    res.json({ ok: true });
  });
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
};

const captureLogs = () => {
  const lines: { level: "log" | "warn"; text: string }[] = [];
  const { log, warn } = console;
  console.log = (...a: unknown[]) => void lines.push({ level: "log", text: a.join(" ") });
  console.warn = (...a: unknown[]) => void lines.push({ level: "warn", text: a.join(" ") });
  return { lines, restore: () => Object.assign(console, { log, warn }) };
};

describe("request timing middleware", () => {
  test("every response carries Server-Timing; no X-Cache unless a cached read happened", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/fast`);
      assert.match(res.headers.get("server-timing") ?? "", /^total;dur=\d+(\.\d+)?$/);
      assert.equal(res.headers.get("x-cache"), null);
    });
  });

  test("a cached read sets X-Cache and extra timings reach Server-Timing", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/cached/7`);
      assert.equal(res.headers.get("x-cache"), "HIT");
      assert.match(res.headers.get("server-timing") ?? "", /total;dur=[\d.]+, db;dur=3\.2/);
    });
  });

  test("a MISS anywhere in the request wins over HITs", async () => {
    await withServer(async (base) => {
      assert.equal((await fetch(`${base}/mixed`)).headers.get("x-cache"), "MISS");
    });
  });

  test("logs method, route template, status and duration; slow requests get the [SLOW] marker", async () => {
    const capture = captureLogs();
    try {
      await withServer(async (base) => {
        await fetch(`${base}/cached/7`);
        await fetch(`${base}/slow`);
        await new Promise((r) => setTimeout(r, 20));
      });
    } finally {
      capture.restore();
    }
    const cached = capture.lines.find((l) => l.text.includes("/cached/:id"));
    assert.ok(cached, "route template is logged, not the concrete id");
    assert.equal(cached!.level, "log");
    assert.match(cached!.text, /^GET \/cached\/:id 200 [\d.]+ms cache=HIT$/);
    const slow = capture.lines.find((l) => l.text.includes("/slow"));
    assert.ok(slow);
    assert.equal(slow!.level, "warn");
    assert.match(slow!.text, /^\[SLOW\] GET \/slow 200 /);
  });
});
