import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { awaitingReply, canResendTo, legacyColumnsFromFirst, overallSend, resolveRecipients, type StakeholderForRecipient } from "./recipients.js";

const people: StakeholderForRecipient[] = [
  { id: 1, projectCode: "P1", name: "Ana Cruz", company: "Cruz Holdings", email: "Ana@Cruz.example" },
  { id: 2, projectCode: "P1", name: "Ben Lee", company: null, email: "ben@lee.example" },
  { id: 3, projectCode: "P1", name: "No Mail", company: null, email: null },
  { id: 4, projectCode: "OTHER", name: "Elsewhere", company: null, email: "x@y.example" },
  { id: 5, projectCode: "P1", name: "Dup", company: null, email: "ana@cruz.example" },
];

describe("choosing recipients", () => {
  test("several stakeholders become several recipients, emails lower-cased", () => {
    const r = resolveRecipients({ projectCode: "P1", stakeholderIds: [1, 2], stakeholders: people });
    assert.deepEqual(r.map((x) => x.email), ["ana@cruz.example", "ben@lee.example"]);
    assert.equal(r[0]!.name, "Ana Cruz (Cruz Holdings)");
    assert.equal(r[1]!.name, "Ben Lee");
    assert.equal(r[0]!.stakeholderId, 1);
  });

  test("the same address is never listed twice, whichever way it arrived", () => {
    const r = resolveRecipients({ projectCode: "P1", stakeholderIds: [1, 5, 1], stakeholders: people, legacyEmail: "ANA@cruz.example" });
    assert.equal(r.length, 1);
  });

  test("the older single email still works, with no stakeholder behind it", () => {
    const r = resolveRecipients({ projectCode: "P1", stakeholders: [], legacyEmail: "client@acme.example" });
    assert.deepEqual(r, [{ stakeholderId: null, name: "client@acme.example", email: "client@acme.example" }]);
  });

  test("a stakeholder without an email, from another project, or an unknown id is refused", () => {
    assert.throws(() => resolveRecipients({ projectCode: "P1", stakeholderIds: [3], stakeholders: people }), /no email address/);
    assert.throws(() => resolveRecipients({ projectCode: "P1", stakeholderIds: [4], stakeholders: people }), /not a stakeholder of this project/);
    assert.throws(() => resolveRecipients({ projectCode: "P1", stakeholderIds: [99], stakeholders: people }), /not a stakeholder of this project/);
  });

  test("nobody chosen is refused, and so is a bad single email", () => {
    assert.throws(() => resolveRecipients({ projectCode: "P1", stakeholderIds: [], stakeholders: people }), /at least one/);
    assert.throws(() => resolveRecipients({ projectCode: "P1", stakeholders: people, legacyEmail: "nope" }), /valid recipient email/);
  });
});

describe("partial send failure", () => {
  test("the overall result tells all-sent, partial, all-failed and not-sent apart", () => {
    const s = (...st: string[]) => st.map((emailStatus) => ({ emailStatus }));
    assert.equal(overallSend(s("sent", "sent")), "sent");
    assert.equal(overallSend(s("sent", "failed")), "partial");
    assert.equal(overallSend(s("failed", "failed")), "failed");
    assert.equal(overallSend(s("not_sent", "not_sent")), "not_sent");
    assert.equal(overallSend([]), "not_sent");
  });

  test("the old columns follow the first recipient", () => {
    assert.deepEqual(legacyColumnsFromFirst([{ email: "a@a.co", emailStatus: "failed" }, { email: "b@b.co", emailStatus: "sent" }]), { recipientEmail: "a@a.co", emailStatus: "failed" });
    assert.deepEqual(legacyColumnsFromFirst([]), { recipientEmail: null, emailStatus: "not_sent" });
  });

  test("only recipients whose email went out and who have not replied are still awaited", () => {
    const rows = [
      { id: 1, emailStatus: "sent", repliedAt: null },
      { id: 2, emailStatus: "failed", repliedAt: null },
      { id: 3, emailStatus: "sent", repliedAt: new Date() },
    ];
    assert.deepEqual(awaitingReply(rows), [1]);
  });
});

describe("resend", () => {
  test("allowed for a recipient who has not replied and is under the limit", () => {
    assert.deepEqual(canResendTo({ emailStatus: "failed", repliedAt: null, resendCount: 0 }), { ok: true });
    assert.deepEqual(canResendTo({ emailStatus: "sent", repliedAt: null, resendCount: 2 }), { ok: true });
  });
  test("refused once they replied or after three resends", () => {
    const replied = canResendTo({ emailStatus: "sent", repliedAt: new Date(), resendCount: 0 });
    assert.equal(replied.ok, false);
    const capped = canResendTo({ emailStatus: "sent", repliedAt: null, resendCount: 3 });
    assert.equal(capped.ok, false);
  });
});
