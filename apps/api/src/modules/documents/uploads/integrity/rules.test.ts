import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";
import { HashingTap, hashStream, sha256Hex, statusOf, verdictFor } from "./rules.js";

const chunks = (data: Buffer, size: number): Buffer[] => {
  const out: Buffer[] = [];
  for (let i = 0; i < data.length; i += size) out.push(data.subarray(i, i + size));
  return out;
};

describe("hashing", () => {
  const data = Buffer.from(Array.from({ length: 100_000 }, (_, i) => i % 251));

  test("hashing a stream in small chunks matches the one-shot hash", async () => {
    const result = await hashStream(Readable.from(chunks(data, 777)));
    assert.equal(result.sha256, sha256Hex(data));
    assert.equal(result.bytes, data.length);
  });

  test("the tap hashes while passing every byte through unchanged", async () => {
    const tap = new HashingTap();
    const received: Buffer[] = [];
    await pipeline(
      Readable.from(chunks(data, 4096)),
      tap,
      new Writable({
        write(chunk, _enc, cb) {
          received.push(chunk);
          cb();
        },
      }),
    );
    assert.equal(tap.digest(), sha256Hex(data));
    assert.equal(tap.bytes, data.length);
    assert.ok(Buffer.concat(received).equals(data));
  });
});

describe("verdict", () => {
  const original = sha256Hex("the contract");

  test("the same bytes are verified", () => {
    assert.equal(verdictFor(original, sha256Hex("the contract")), "verified");
    assert.equal(verdictFor(original.toUpperCase(), sha256Hex("the contract")), "verified");
  });

  test("a changed file is damaged (a mismatch sets damaged)", () => {
    assert.equal(verdictFor(original, sha256Hex("the contract!")), "damaged");
  });

  test("no fingerprint on record is never called damaged", () => {
    assert.equal(verdictFor(null, sha256Hex("anything")), "unverified");
    assert.equal(verdictFor("", sha256Hex("anything")), "unverified");
  });

  test("a missing row is treated as unverified; a stored status is kept", () => {
    assert.equal(statusOf(undefined), "unverified");
    assert.equal(statusOf(null), "unverified");
    assert.equal(statusOf({ integrityStatus: "verified" }), "verified");
    assert.equal(statusOf({ integrityStatus: "damaged" }), "damaged");
    assert.equal(statusOf({ integrityStatus: "something-else" }), "unverified");
  });
});
