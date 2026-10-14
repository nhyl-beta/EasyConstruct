import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { SECURITY_HEADERS, securityHeaders } from "./security-headers.js";

const fakeResponse = (preset: Record<string, string> = {}) => {
  const headers = new Map<string, string>(Object.entries(preset));
  return {
    getHeader: (n: string) => headers.get(n),
    setHeader: (n: string, v: string) => void headers.set(n, v),
    headers,
  };
};

test("every API answer gets the baseline headers", () => {
  const res = fakeResponse();
  let called = false;
  securityHeaders({} as Request, res as unknown as Response, () => {
    called = true;
  });
  assert.equal(called, true);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) assert.equal(res.headers.get(name), value);
});

test("a header a route already set on purpose is kept", () => {
  const res = fakeResponse({ "X-Frame-Options": "SAMEORIGIN" });
  securityHeaders({} as Request, res as unknown as Response, () => undefined);
  assert.equal(res.headers.get("X-Frame-Options"), "SAMEORIGIN");
});

test("nothing that would block cross-origin API use is set", () => {
  const names = Object.keys(SECURITY_HEADERS).map((n) => n.toLowerCase());
  assert.ok(!names.includes("content-security-policy"));
  assert.ok(!names.includes("cross-origin-resource-policy"));
  assert.ok(!names.includes("cross-origin-opener-policy"));
});
