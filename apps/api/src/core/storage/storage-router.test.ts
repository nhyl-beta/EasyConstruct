import { test } from "node:test";
import assert from "node:assert/strict";
import type { StorageAdapter } from "./adapter.js";
import { createStorageRouter } from "./index.js";
import { isS3Url, keyFromS3Url, s3KeyFor, type S3FileStorage } from "./s3.adapter.js";

const calls: string[] = [];
const fake = (name: string): StorageAdapter => ({
  put: async (i) => (calls.push(`${name}.put`), { url: `${name}:u`, filename: i.filename, contentType: i.contentType, sizeBytes: 1 }),
  open: async () => (calls.push(`${name}.open`), { stream: null as never, contentType: "x" }),
  delete: async () => void calls.push(`${name}.delete`),
  exists: () => (calls.push(`${name}.exists`), true),
});
const fakeS3 = (): S3FileStorage => ({
  ...fake("s3"),
  putFile: async (_p, filename, contentType) => (calls.push("s3.putFile"), { url: "s3:k", filename, contentType, sizeBytes: 1 }),
});
const router = (s3: boolean, blob: boolean) =>
  createStorageRouter({ s3: fakeS3(), blob: fake("blob"), local: fake("local"), s3Configured: () => s3, blobConfigured: () => blob });
const input = { buffer: Buffer.from("x"), filename: "a.pdf", contentType: "application/pdf" };
const BLOB = "https://abc.private.blob.vercel-storage.com/easyconstruct/1-a.pdf";

test("put prefers S3, then Blob, then local disk", async () => {
  calls.length = 0;
  await router(true, true).put(input);
  await router(false, true).put(input);
  await router(false, false).put(input);
  assert.deepEqual(calls, ["s3.put", "blob.put", "local.put"]);
});

test("open/delete/exists follow the URL shape", async () => {
  calls.length = 0;
  const r = router(true, true);
  await r.open("s3:easyconstruct/1-a.pdf");
  await r.open(BLOB);
  await r.open("/uploads/generic/a.pdf");
  await r.delete("s3:easyconstruct/1-a.pdf");
  r.exists("/uploads/generic/a.pdf");
  assert.deepEqual(calls, ["s3.open", "blob.open", "local.open", "s3.delete", "local.exists"]);
});

test("a Blob URL without a Blob token is a clear 'not available' error, not a crash", async () => {
  const r = router(true, false);
  await assert.rejects(() => r.open(BLOB), (e: { statusCode?: number; code?: string }) => e.statusCode === 404 && e.code === "FILE_NOT_AVAILABLE");
  await r.delete(BLOB);
  assert.equal(r.exists(BLOB), true);
});

test("putFile needs S3", async () => {
  await assert.rejects(() => router(false, true).putFile("/tmp/x", "a.pdf", "application/pdf"));
  assert.equal((await router(true, false).putFile("/tmp/x", "a.pdf", "application/pdf")).url, "s3:k");
});

test("S3 keys: easyconstruct/<timestamp>-<cleaned filename>", () => {
  assert.equal(s3KeyFor("My Plan (v2).pdf", 1700000000000), "easyconstruct/1700000000000-My-Plan--v2-.pdf");
  assert.equal(isS3Url("s3:easyconstruct/1-a.pdf"), true);
  assert.equal(isS3Url("/uploads/generic/a.pdf"), false);
});

test("an s3: url can only name keys the app wrote", () => {
  assert.equal(keyFromS3Url("s3:easyconstruct/1-a.pdf"), "easyconstruct/1-a.pdf");
  for (const bad of ["s3:other/1-a.pdf", "s3:easyconstruct/../secret", "s3:", "s3:/etc/passwd"]) {
    assert.throws(() => keyFromS3Url(bad), /not found/i);
  }
});
