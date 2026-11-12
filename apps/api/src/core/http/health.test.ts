import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { healthHandler, readyHandler } from "./health.js";

test("GET /api/health answers 200 { ok: true } with no credentials", async () => {
  const app = express();
  app.get("/api/health", healthHandler);
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  } finally {
    server.close();
  }
});

test("GET /api/health/ready answers 200 when the database answers and 503 when it does not", async () => {
  const app = express();
  app.get("/up", readyHandler(async () => 1));
  app.get("/down", readyHandler(async () => { throw new Error("connection refused"); }));
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    assert.equal((await fetch(`http://127.0.0.1:${port}/up`)).status, 200);
    const down = await fetch(`http://127.0.0.1:${port}/down`);
    assert.equal(down.status, 503);
    assert.deepEqual(await down.json(), { ok: false });
  } finally {
    server.close();
  }
});
