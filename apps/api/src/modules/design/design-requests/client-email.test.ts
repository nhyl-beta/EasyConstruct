import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { DesignRequest } from "../../../core/db/schema/design-requests.js";
import { buildClientEmail, buildSubject, oneLine } from "./client-email.js";
import { isOpenRequest } from "./rules.js";

const request = {
  id: 1,
  kind: "RFI",
  number: "RFI-PCMC-AR-005-22",
  projectCode: "PCMC",
  discipline: "AR",
  sheetNumbers: "A-101",
  subject: "Wall type\r\nBcc: evil@example.com",
  sectionsReferenced: null,
  requestText: "<script>alert(1)</script> Which finish applies?",
  costImpact: "increase",
  costNote: "extra tiles",
  timeImpact: "none",
  timeDays: null,
  requestedByRole: "project-manager",
  dueDate: new Date("2026-01-10T00:00:00Z"),
} as unknown as DesignRequest;

describe("client email", () => {
  test("subject is tagged and never contains a newline", () => {
    const s = buildSubject(request);
    assert.ok(s.startsWith("[RFI-PCMC-AR-005-22] "));
    assert.ok(s.endsWith(" - PCMC"));
    assert.doesNotMatch(s, /[\r\n]/);
    assert.equal(oneLine("a\nb\r\nc"), "a b c");
  });

  test("user text is HTML-escaped", () => {
    const { html, text } = buildClientEmail(
      { request, projectName: "Pacific <Mall>", senderName: "Ana", senderEmail: "ana@example.com", files: [], to: "client@example.com" },
      ["big.pdf"],
    );
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(html.includes("Pacific &lt;Mall&gt;"));
    assert.ok(text.includes("full files available on request: big.pdf"));
  });

  test("client_replied still counts as open for the project-close gate", () => {
    assert.equal(isOpenRequest("client_replied"), true);
    assert.equal(isOpenRequest("answered"), false);
  });
});
