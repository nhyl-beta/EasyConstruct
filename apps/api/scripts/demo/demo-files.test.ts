import { test } from "node:test";
import assert from "node:assert/strict";

import { samplePdf, sampleFor } from "./demo-files.js";

test("a file named like a contract uploads the real contract sample, others stay generated", () => {
  const pdf = samplePdf("DEMO-S1-contract.pdf");
  assert.ok(pdf && pdf.subarray(0, 4).toString() === "%PDF");
  assert.equal(samplePdf("DEMO-S1-random-note.pdf"), null);
});

test("every sample named in the rules exists on disk and attendance photos map to a JPEG", () => {
  for (const f of ["proposal", "award", "contract", "blueprint", "ntp", "completion", "turnover", "acceptance", "architectural", "structural", "design", "material"]) {
    assert.ok(samplePdf(`x-${f}.pdf`), f);
  }
  const img = sampleFor("att-123.png", [[/^att-/, "12_Clock_In_Verification_Photo.jpg"]]);
  assert.equal(img?.bytes[0], 0xff);
});
