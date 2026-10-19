import { describe, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { bumpVersions, cached, setCacheStore } from "./index.js";
import { UpstashCacheStore } from "./upstash.js";

/**
 * A tiny stand-in for Upstash's REST endpoint. The client auto-pipelines, so
 * commands arrive as POST /pipeline with an array of command arrays and expect
 * an array of { result } back (POST / with a single command is answered too).
 */
const fakeUpstash = async (opts: { delayMs?: number; fail?: boolean } = {}) => {
  const data = new Map<string, string>();
  const commands: string[][] = [];
  const run = (cmd: string[]) => {
    commands.push(cmd);
    const [name, key, ...rest] = cmd as [string, string, ...string[]];
    let result: unknown = null;
    const op = name?.toUpperCase();
    if (op === "GET") result = data.get(key!) ?? null;
    if (op === "SET") {
      data.set(key!, rest[0]!);
      result = "OK";
    }
    if (op === "INCR") {
      const next = Number(data.get(key!) ?? 0) + 1;
      data.set(key!, String(next));
      result = next;
    }
    return { result };
  };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const parsed = JSON.parse(body) as string[] | string[][];
      setTimeout(() => {
        if (opts.fail) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "ERR boom" }));
          return;
        }
        const out = Array.isArray(parsed[0]) ? (parsed as string[][]).map(run) : run(parsed as string[]);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(out));
      }, opts.delayMs ?? 0);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, commands, close: () => server.close() };
};

describe("Upstash REST store", () => {
  test("get / set (with an expiry) / incr round-trip", async () => {
    const fake = await fakeUpstash();
    try {
      const store = new UpstashCacheStore(fake.url, "token");
      assert.equal(await store.get("a"), null);
      await store.set("a", JSON.stringify({ x: 1 }), 30);
      assert.equal(await store.get("a"), '{"x":1}');
      assert.equal(await store.incr("ec:v1:projects:ver"), 1);
      assert.equal(await store.incr("ec:v1:projects:ver"), 2);
      assert.equal(await store.get("ec:v1:projects:ver"), "2");
      const set = fake.commands.find((c) => c[0]?.toUpperCase() === "SET")!;
      assert.deepEqual(set.slice(-2).map((s) => String(s).toUpperCase()), ["EX", "30"]);
    } finally {
      fake.close();
    }
  });

  test("cached() works end to end on top of it, and a write invalidates", async () => {
    const fake = await fakeUpstash();
    try {
      setCacheStore(new UpstashCacheStore(fake.url, "token"));
      let calls = 0;
      const load = async () => (calls++, ["row"]);
      assert.deepEqual(await cached("projects", "role:admin", 60, load), ["row"]);
      assert.deepEqual(await cached("projects", "role:admin", 60, load), ["row"]);
      assert.equal(calls, 1);
      await bumpVersions("projects");
      await cached("projects", "role:admin", 60, load);
      assert.equal(calls, 2);
    } finally {
      setCacheStore(undefined);
      fake.close();
    }
  });

  test("a slow Redis is abandoned after the command timeout and the request still succeeds", async () => {
    const fake = await fakeUpstash({ delayMs: 1500 });
    try {
      setCacheStore(new UpstashCacheStore(fake.url, "token", 150));
      const started = Date.now();
      const value = await cached("projects", "all", 60, async () => "from the database");
      assert.equal(value, "from the database");
      assert.ok(Date.now() - started < 1000, `took ${Date.now() - started} ms`);
    } finally {
      setCacheStore(undefined);
      fake.close();
    }
  });

  test("an erroring Redis falls through and nothing throws", async () => {
    const fake = await fakeUpstash({ fail: true });
    try {
      setCacheStore(new UpstashCacheStore(fake.url, "token", 300));
      assert.equal(await cached("projects", "all", 60, async () => "from the database"), "from the database");
      await assert.doesNotReject(() => bumpVersions("projects"));
    } finally {
      setCacheStore(undefined);
      fake.close();
    }
  });
});
