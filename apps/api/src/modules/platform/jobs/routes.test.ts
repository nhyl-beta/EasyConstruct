import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { env } from "../../../core/config/env.js";
import { errorMiddleware } from "../../../core/http/error.js";
import router from "./routes.js";

const mutableEnv = env as { CRON_SECRET?: string };
let server: Server;
let base = "";

before(() => {
  const app = express();
  app.use("/api/cron", router);
  app.use(errorMiddleware);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/cron`;
});
after(() => server.close());

const PATHS = ["signals", "attendance-exceptions", "overdue", "design-requests-sweep"];

test("every cron route refuses when CRON_SECRET is unset", async () => {
  mutableEnv.CRON_SECRET = undefined;
  for (const p of PATHS) {
    const res = await fetch(`${base}/${p}`, { headers: { Authorization: "Bearer anything" } });
    assert.equal(res.status, 403, p);
  }
});

test("every cron route rejects a missing or wrong secret", async () => {
  mutableEnv.CRON_SECRET = "right-secret";
  for (const p of PATHS) {
    assert.equal((await fetch(`${base}/${p}`)).status, 401, `${p} without header`);
    const wrong = await fetch(`${base}/${p}`, { headers: { Authorization: "Bearer wrong-secret" } });
    assert.equal(wrong.status, 401, `${p} wrong secret`);
    const noScheme = await fetch(`${base}/${p}`, { headers: { Authorization: "right-secret" } });
    assert.equal(noScheme.status, 401, `${p} no Bearer`);
  }
});
