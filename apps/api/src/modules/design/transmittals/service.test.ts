import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { EMAIL_RE, buildTransmittalEmail } from "./service.js";
import type { Transmittal, TransmittalItem } from "../../../core/db/schema/design-requests.js";

describe("transmittal issuing: whether/what it emails", () => {
  test("EMAIL_RE only matches toName values that are actually an email address", () => {
    assert.equal(EMAIL_RE.test("pm@easyconstruct.test"), true);
    assert.equal(EMAIL_RE.test("Site Engineer's Office"), false);
    assert.equal(EMAIL_RE.test("Engineering Dept."), false);
    assert.equal(EMAIL_RE.test(""), false);
  });

  test("buildTransmittalEmail includes the control no., purpose, and each particular", () => {
    const row = {
      controlNo: "P-TR-2026-001",
      projectCode: "PCMC",
      subject: "Shop drawings for review",
      purposes: ["For your information"],
      purposeOther: null,
      thruName: null,
      transmittedByName: "Nhyl Gervasio",
      dateIssued: "2026-11-15",
      items: [
        { particulars: "Structural plan Rev. B", remarks: "Supersedes Rev. A" },
        { particulars: "Electrical layout", remarks: null },
      ] as TransmittalItem[],
    } as Transmittal & { items: TransmittalItem[] };

    const { subject, text } = buildTransmittalEmail(row);
    assert.match(subject, /P-TR-2026-001/);
    assert.match(text, /For your information/);
    assert.match(text, /Structural plan Rev\. B — Supersedes Rev\. A/);
    assert.match(text, /Electrical layout/);
  });
});
