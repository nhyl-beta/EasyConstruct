import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { env } from "../config/env.js";
import { corsMiddleware } from "./cors.js";

let server: Server;
let base = "";
before(() => {
  const app = express();
  app.use(corsMiddleware);
  app.all("/x", (_req, res) => res.json({ ok: true }));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/x`;
});
after(() => server.close());

const preflight = (method: string, headers: string, origin = env.CORS_ORIGIN) =>
  fetch(base, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": method, "Access-Control-Request-Headers": headers } });

for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
  test(`preflight allows ${method} with Authorization, Content-Type and X-Request-ID from the configured origin`, async () => {
    const res = await preflight(method, "authorization,content-type,x-request-id");
    assert.ok(res.status === 204 || res.status === 200);
    assert.equal(res.headers.get("access-control-allow-origin"), env.CORS_ORIGIN);
    assert.equal(res.headers.get("access-control-allow-credentials"), "true");
    assert.ok(res.headers.get("access-control-allow-methods")!.split(",").includes(method));
    const allowed = res.headers.get("access-control-allow-headers")!.toLowerCase();
    for (const h of ["authorization", "content-type", "x-request-id"]) assert.ok(allowed.includes(h), h);
  });
}

test("another origin gets no allow-origin header, and the origin is never '*'", async () => {
  const res = await preflight("GET", "authorization", "https://evil.example");
  assert.notEqual(res.headers.get("access-control-allow-origin"), "https://evil.example");
  assert.notEqual(res.headers.get("access-control-allow-origin"), "*");
});

test("actual responses expose the headers the client reads", async () => {
  const res = await fetch(base, { headers: { Origin: env.CORS_ORIGIN } });
  const exposed = res.headers.get("access-control-expose-headers")!.toLowerCase();
  for (const h of ["content-disposition", "x-request-id"]) assert.ok(exposed.includes(h), h);
});
