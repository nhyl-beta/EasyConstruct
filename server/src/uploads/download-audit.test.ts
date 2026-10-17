import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildDownloadAudit, entityIdFor, fileNameOf } from "./download-audit.js";

describe("download audit line", () => {
  const ctx = { documentId: "ADV-1", title: "Building permit", project: "PRJ-1", docType: "Permit" };

  test("names who, the file and its url, the project and the type", () => {
    const a = buildDownloadAudit({ actor: "Dana", url: "/uploads/documents/123-permit.pdf", ctx, sensitive: false, result: "ok" });
    assert.equal(a.entityType, "file");
    assert.equal(a.action, "downloaded");
    assert.equal(a.entityId, "ADV-1");
    assert.equal(a.projectCode, "PRJ-1");
    assert.match(a.summary!, /Dana downloaded file "Building permit \(123-permit\.pdf\)" from project PRJ-1, type Permit \[\/uploads\/documents\/123-permit\.pdf\]/);
  });

  test("a Legal document download gets the sensitive action", () => {
    const a = buildDownloadAudit({ actor: "Dana", url: "/uploads/documents/x.pdf", ctx, sensitive: true, result: "ok" });
    assert.equal(a.action, "sensitive_download");
    assert.match(a.summary!, /legal file/);
  });

  test("a refused or failed download is recorded with its result", () => {
    const a = buildDownloadAudit({ actor: "Rico", url: "/uploads/x.pdf", sensitive: false, result: "denied", reason: "no access" });
    assert.equal(a.action, "download_blocked");
    assert.match(a.summary!, /refused: no access/);
    assert.equal(a.projectCode, undefined);
  });

  test("a file with no document is identified by name and a short url fingerprint that fits varchar(50)", () => {
    const url = "https://abc.private.blob.vercel-storage.com/easyconstruct/1700000-plan.pdf?x=1";
    assert.equal(fileNameOf(url), "1700000-plan.pdf");
    const id = entityIdFor(url, null);
    assert.ok(id.length <= 50);
    assert.equal(id, entityIdFor(url, null));
  });
});
