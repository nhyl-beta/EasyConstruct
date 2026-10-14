import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { canSeeProposalFiles, toSubmittedFiles, type AttachmentRow } from "./files.js";

const row = (id: number, over: Partial<AttachmentRow["attachment"]> = {}, stageLabel: string | null = "Architect"): AttachmentRow => ({
  attachment: {
    id,
    kind: "document",
    label: `file-${id}.pdf`,
    fileName: `file-${id}.pdf`,
    fileUrl: `https://store.public.blob.vercel-storage.com/easyconstruct/${id}.pdf`,
    fileSize: "1 MB",
    uploadedBy: "Ana Cruz",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    ...over,
  },
  stageLabel,
});

describe("toSubmittedFiles", () => {
  test("a proposal with a file returns it, with the fields the consultant screen shows", () => {
    const files = toSubmittedFiles([row(1)]);
    assert.equal(files.length, 1);
    assert.deepEqual(
      { id: files[0]!.id, name: files[0]!.name, size: files[0]!.size, uploadedBy: files[0]!.uploadedBy, stage: files[0]!.stage, available: files[0]!.available },
      { id: 1, name: "file-1.pdf", size: "1 MB", uploadedBy: "Ana Cruz", stage: "Architect", available: true },
    );
  });

  test("a proposal without a file returns an empty list: notes and rows without a url are not files", () => {
    assert.deepEqual(toSubmittedFiles([]), []);
    assert.deepEqual(toSubmittedFiles([row(2, { kind: "note", fileUrl: null }), row(3, { fileUrl: null })]), []);
  });

  test("an attachment whose stage row is gone still comes back, without a stage", () => {
    assert.equal(toSubmittedFiles([row(4, {}, null)])[0]!.stage, null);
  });

  test("a file whose bytes are gone is listed but marked unavailable, so the screen can say so", () => {
    const legacy = row(5, { fileUrl: "/uploads/documents/plan-123.pdf" });
    const [f] = toSubmittedFiles([legacy], (url) => !url.startsWith("/uploads/documents/"));
    assert.equal(f!.available, false);
  });

  test("falls back to the label when there is no file name", () => {
    assert.equal(toSubmittedFiles([row(6, { fileName: null, label: "Floor plan" })])[0]!.name, "Floor plan");
  });
});

describe("who can read a proposal's files", () => {
  const assigned = new Set(["P-1"]);
  test("the consultant gets the files of a proposal they review (not assigned-scoped)", () => {
    assert.equal(canSeeProposalFiles({ id: 7, role: "consultant" }, new Set(), "P-1"), true);
  });
  test("an Architect assigned to the project can, one not assigned to it cannot", () => {
    assert.equal(canSeeProposalFiles({ id: 8, role: "architect" }, assigned, "P-1"), true);
    assert.equal(canSeeProposalFiles({ id: 9, role: "architect" }, assigned, "P-2"), false);
    assert.equal(canSeeProposalFiles({ id: 9, role: "architect" }, new Set(), "P-1"), false);
  });
});
