import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildTransmittalHtml, buildTransmittalPdf, type TransmittalForm } from "./form.js";
import { buildTransmittalEmail } from "./service.js";

const row = {
  controlNo: "P-MR-2026-DOC-06-26",
  projectCode: "P-MR-2026",
  dateIssued: "2026-11-16",
  location: null,
  toName: "site@example.com",
  sentMode: "Email",
  type: "inter-agency",
  subject: "Test <Subject>",
  purposes: ["for-document", "others"],
  purposeOther: "Site memo",
  thruName: null,
  transmittedByName: "Engineer Three",
  receivedByName: null,
  items: Array.from({ length: 40 }, (_, i) => ({ particulars: `Drawing ${i + 1}`, remarks: null })),
  acknowledgements: [],
} as unknown as TransmittalForm;
const project = { name: "Mj resident", location: "Caloocan" };

describe("transmittal form (email body and PDF attachment)", () => {
  test("the HTML body shows the same details as the on-screen form, escaped", () => {
    const html = buildTransmittalHtml(row, project);
    for (const s of ["November 16, 2026", "Mj resident", "Caloocan", "P-MR-2026-DOC-06-26", "For document", "Others: Site memo", "Drawing 40", "Engineer Three"]) assert.ok(html.includes(s), s);
    assert.ok(html.includes("Test &lt;Subject&gt;") && !html.includes("<Subject>"));
    assert.ok(html.includes("&#9745; Inter-agency") && html.includes("&#9744; Inter-office"));
  });

  test("the PDF is a real PDF and a long item list continues onto more pages", async () => {
    const pdf = await buildTransmittalPdf(row, project);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length >= 2);
  });

  test("the plain-text fallback names the purposes, not their codes", () => {
    const { text } = buildTransmittalEmail(row);
    assert.ok(text.includes("For document") && !text.includes("for-document"));
  });
});
