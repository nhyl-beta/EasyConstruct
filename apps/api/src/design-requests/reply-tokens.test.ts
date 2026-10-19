import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TOKEN_DAYS,
  TOKEN_PATTERN,
  evaluateToken,
  expiryFor,
  fileBelongsToRequest,
  generateToken,
  hashToken,
  replyLimits,
  replyUrl,
  tokenDays,
} from "./reply-tokens.js";
import { hitLimiter } from "../auth/throttle.js";

describe("token generation and hashing", () => {
  test("a token is 32 random bytes and never repeats", () => {
    const a = generateToken();
    const b = generateToken();
    assert.notEqual(a, b);
    assert.match(a, TOKEN_PATTERN);
    assert.equal(Buffer.from(a, "base64url").length, 32);
  });

  test("only a SHA-256 hash is stored: stable, 64 hex characters, and not the token", () => {
    const t = generateToken();
    const h = hashToken(t);
    assert.equal(h, hashToken(t));
    assert.match(h, /^[0-9a-f]{64}$/);
    assert.notEqual(h, t);
    assert.ok(!h.includes(t));
    assert.notEqual(hashToken(t), hashToken(generateToken()));
  });
});

describe("expiry", () => {
  const now = new Date("2026-10-01T00:00:00Z");

  test("expires after RFI_REPLY_TOKEN_DAYS, default 14", () => {
    assert.equal(tokenDays(undefined), DEFAULT_TOKEN_DAYS);
    assert.equal(tokenDays("7"), 7);
    assert.equal(tokenDays("abc"), 14);
    assert.equal(tokenDays("0"), 14);
    assert.equal(expiryFor(now, 14).toISOString(), "2026-10-15T00:00:00.000Z");
  });

  test("valid before the expiry, expired at and after it", () => {
    const row = { expiresAt: expiryFor(now, 14), usedAt: null };
    assert.equal(evaluateToken(row, new Date("2026-10-14T23:59:59Z")), "ok");
    assert.equal(evaluateToken(row, new Date("2026-10-15T00:00:00Z")), "expired");
    assert.equal(evaluateToken(row, new Date("2026-11-01T00:00:00Z")), "expired");
  });

  test("an unknown token is missing", () => {
    assert.equal(evaluateToken(null, now), "missing");
    assert.equal(evaluateToken(undefined, now), "missing");
  });
});

describe("single use", () => {
  test("a token that was used is refused, even when it would still be in date", () => {
    const row = { expiresAt: new Date("2030-01-01T00:00:00Z"), usedAt: new Date("2026-10-02T00:00:00Z") };
    assert.equal(evaluateToken(row, new Date("2026-10-03T00:00:00Z")), "used");
  });
});

describe("attachments are scoped to the request", () => {
  test("only request-stage files of the same request", () => {
    assert.equal(fileBelongsToRequest({ requestId: 5, stage: "request" }, 5), true);
    assert.equal(fileBelongsToRequest({ requestId: 6, stage: "request" }, 5), false);
    assert.equal(fileBelongsToRequest({ requestId: 5, stage: "response" }, 5), false);
    assert.equal(fileBelongsToRequest(null, 5), false);
  });
});

describe("rate limit", () => {
  test("the sixth attempt in the window is refused, and the window frees up again", () => {
    const hits = new Map<string, number[]>();
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) assert.equal(hitLimiter(hits, "1.2.3.4", t0 + i, 5, 60_000), true);
    assert.equal(hitLimiter(hits, "1.2.3.4", t0 + 10, 5, 60_000), false);
    assert.equal(hitLimiter(hits, "5.6.7.8", t0 + 10, 5, 60_000), true, "another address is not affected");
    assert.equal(hitLimiter(hits, "1.2.3.4", t0 + 61_000, 5, 60_000), true);
  });
});

describe("links and limits", () => {
  test("the reply link points at the browser app's /reply/:token route", () => {
    assert.equal(replyUrl("https://app.example.com/", "abc"), "https://app.example.com/reply/abc");
  });
  test("limits default to 5 files of 4 MB and respect the settings", () => {
    assert.deepEqual(replyLimits({}), { maxFiles: 5, maxFileBytes: 4 * 1024 * 1024 });
    assert.deepEqual(replyLimits({ files: "2", fileMb: "10" }), { maxFiles: 2, maxFileBytes: 10 * 1024 * 1024 });
    assert.deepEqual(replyLimits({ files: "99", fileMb: "0" }), { maxFiles: 5, maxFileBytes: 4 * 1024 * 1024 });
  });
});
