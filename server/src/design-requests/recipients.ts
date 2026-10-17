// server/src/design-requests/recipients.ts: pure, no I/O (client demo change #5)
//
// Who a client RFI/RFA is emailed to. Turns the chosen stakeholders (and the old single email) into a
// clean recipient list, and works out the request-level summary from the per-recipient results.
import { ValidationError } from "../utils/errors.js";
import { isValidEmail, normalizeEmail } from "../project-stakeholders/rules.js";
import { MAX_EMAIL_RESENDS, type EmailStatus } from "./rules.js";

export interface RecipientCandidate {
  stakeholderId: number | null;
  name: string;
  email: string;
}

export interface StakeholderForRecipient {
  id: number;
  projectCode: string;
  name: string;
  company: string | null;
  email: string | null;
}

/** "Ana Cruz (Cruz Holdings)" - what the request detail shows for a recipient. */
export const recipientLabel = (s: Pick<StakeholderForRecipient, "name" | "company">): string => (s.company?.trim() ? `${s.name} (${s.company.trim()})` : s.name);

export const MAX_RECIPIENTS = 20;

/**
 * The recipients for a request: the chosen stakeholders (each must belong to the project and have an
 * email) plus, for the older single-email form, that address. The same address is never listed twice.
 */
export const resolveRecipients = (input: {
  projectCode: string;
  stakeholderIds?: readonly number[];
  stakeholders: readonly StakeholderForRecipient[];
  legacyEmail?: string | null;
}): RecipientCandidate[] => {
  const out: RecipientCandidate[] = [];
  const seen = new Set<string>();
  const byId = new Map(input.stakeholders.map((s) => [s.id, s]));

  for (const id of new Set(input.stakeholderIds ?? [])) {
    const s = byId.get(id);
    if (!s || s.projectCode !== input.projectCode) throw new ValidationError("A chosen recipient is not a stakeholder of this project");
    if (!s.email || !isValidEmail(s.email)) throw new ValidationError(`${s.name} has no email address on file, so a request cannot be sent to them`);
    const email = normalizeEmail(s.email);
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ stakeholderId: s.id, name: recipientLabel(s), email });
  }

  const legacy = input.legacyEmail?.trim();
  if (legacy) {
    if (!isValidEmail(legacy)) throw new ValidationError("Enter a valid recipient email address");
    const email = normalizeEmail(legacy);
    if (!seen.has(email)) {
      seen.add(email);
      out.push({ stakeholderId: null, name: legacy, email });
    }
  }

  if (out.length === 0) throw new ValidationError("Choose at least one stakeholder to send this request to");
  if (out.length > MAX_RECIPIENTS) throw new ValidationError(`A request can be sent to at most ${MAX_RECIPIENTS} people`);
  return out;
};

export interface RecipientState {
  emailStatus: string;
  repliedAt: Date | null;
  resendCount: number;
}

export type OverallSend = "not_sent" | "sent" | "partial" | "failed";

/** Request-level summary of the per-recipient email results. */
export const overallSend = (recipients: readonly Pick<RecipientState, "emailStatus">[]): OverallSend => {
  if (recipients.length === 0) return "not_sent";
  const sent = recipients.filter((r) => r.emailStatus === "sent").length;
  const failed = recipients.filter((r) => r.emailStatus === "failed").length;
  if (sent === recipients.length) return "sent";
  if (failed === recipients.length) return "failed";
  if (sent > 0 || failed > 0) return sent > 0 ? "partial" : "failed";
  return "not_sent";
};

/** The old single-recipient columns, filled from the first recipient so older screens keep working. */
export const legacyColumnsFromFirst = (recipients: readonly { email: string; emailStatus: string }[]): { recipientEmail: string | null; emailStatus: EmailStatus } => {
  const first = recipients[0];
  if (!first) return { recipientEmail: null, emailStatus: "not_sent" };
  const status = (["not_sent", "sent", "failed"] as const).find((s) => s === first.emailStatus) ?? "not_sent";
  return { recipientEmail: first.email, emailStatus: status };
};

/** One recipient can be re-emailed until they reply, up to MAX_EMAIL_RESENDS times. */
export const canResendTo = (r: RecipientState): { ok: true } | { ok: false; reason: string } => {
  if (r.repliedAt) return { ok: false, reason: "This person has already replied" };
  if (r.resendCount >= MAX_EMAIL_RESENDS) return { ok: false, reason: `Already re-emailed ${MAX_EMAIL_RESENDS} times` };
  return { ok: true };
};

export interface SendOutcome {
  recipientId: number;
  ok: boolean;
}

/** Who is left to reply: recipients whose email went out and who have not answered. */
export const awaitingReply = (recipients: readonly (Pick<RecipientState, "emailStatus" | "repliedAt"> & { id: number })[]): number[] =>
  recipients.filter((r) => r.emailStatus === "sent" && !r.repliedAt).map((r) => r.id);
