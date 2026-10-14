import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { allowsQueryToken, isTokenSignedOut, sessionCutoff } from "./session.js";

describe("sessionCutoff", () => {
  test("the later of the two instants, or whichever exists", () => {
    assert.equal(sessionCutoff(null, null), null);
    assert.equal(sessionCutoff(1000, null), 1000);
    assert.equal(sessionCutoff(null, 2000), 2000);
    assert.equal(sessionCutoff(1000, 2000), 2000);
    assert.equal(sessionCutoff(3000, 2000), 3000);
  });
});

describe("isTokenSignedOut", () => {
  const cutoff = Date.parse("2026-10-14T10:00:00.500Z");
  const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);
  test("a token issued before the sign-out is dead", () => {
    assert.equal(isTokenSignedOut(sec("2026-10-14T09:59:00Z"), cutoff), true);
  });
  test("a token issued after the sign-out (a new login) works", () => {
    assert.equal(isTokenSignedOut(sec("2026-10-14T10:00:01Z"), cutoff), false);
  });
  test("a sign-in in the same second as the sign-out still works", () => {
    assert.equal(isTokenSignedOut(sec("2026-10-14T10:00:00Z"), cutoff), false);
  });
  test("no cutoff means nothing is signed out", () => {
    assert.equal(isTokenSignedOut(sec("2020-01-01T00:00:00Z"), null), false);
    assert.equal(isTokenSignedOut(undefined, cutoff), false);
  });
});

describe("?token= is for the notification stream only", () => {
  test("the stream route accepts it", () => {
    assert.equal(allowsQueryToken("GET", "/api/notifications/stream"), true);
    assert.equal(allowsQueryToken("GET", "/api/notifications/stream/"), true);
  });
  test("every other route does not", () => {
    for (const p of ["/api/projects", "/api/notifications", "/api/uploads/file", "/api/notifications/stream/x", "/api/auth/logout"]) {
      assert.equal(allowsQueryToken("GET", p), false, p);
    }
  });
  test("only GET", () => {
    assert.equal(allowsQueryToken("POST", "/api/notifications/stream"), false);
  });
});
