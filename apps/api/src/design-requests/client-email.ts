// apps/api/src/design-requests/client-email.ts
//
// Builds and sends the "RFI/RFA to client" email. Outbound only: the client
// replies from their own mailbox to the sender (Cc + Reply-To), and the sender
// updates the request status in the app by hand.
import type { DesignRequest, DesignRequestFile } from "../core/db/schema/design-requests.js";
import { sendMail } from "../core/mail/mailer.js";
import { openStoredFile } from "../uploads/service.js";

/** Total attachment size we are willing to put on one email. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Header values must be a single line. */
export const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim();

export const buildSubject = (r: Pick<DesignRequest, "number" | "subject" | "projectCode">): string =>
  oneLine(`[${r.number}] ${r.subject} - ${r.projectCode}`);

const IMPACT_TEXT: Record<string, string> = { none: "None", increase: "Increase", decrease: "Decrease" };

const impactLine = (impact: string, note: string | null, days: number | null, unit: "cost" | "time"): string => {
  const base = IMPACT_TEXT[impact] ?? impact;
  if (impact === "none") return base;
  if (unit === "cost") return note ? `${base} (${note})` : base;
  return days != null ? `${base} (${days} day${days === 1 ? "" : "s"})` : base;
};

const longDate = (d: Date | null): string =>
  d ? d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila" }) : "Not set";

export interface ClientEmailContext {
  request: DesignRequest;
  projectName: string;
  senderName: string;
  senderEmail: string;
  files: Pick<DesignRequestFile, "url" | "filename" | "contentType" | "sizeBytes">[];
  /** The one address this copy goes to (a request can go to several people, one email each). */
  to: string;
  /** Link to the no-login reply page for this recipient (client demo change #6). */
  replyUrl?: string;
}

export interface PreparedAttachments {
  attached: { filename: string; content: Buffer; contentType: string }[];
  notAttached: string[];
}

/** Reads files into attachments up to the cap; the rest are listed as "available on request". */
export const collectAttachments = async (files: ClientEmailContext["files"]): Promise<PreparedAttachments> => {
  const attached: { filename: string; content: Buffer; contentType: string }[] = [];
  const notAttached: string[] = [];
  let total = 0;
  for (const f of files) {
    if (total + f.sizeBytes > MAX_ATTACHMENT_BYTES) {
      notAttached.push(f.filename);
      continue;
    }
    try {
      const stored = await openStoredFile(f.url);
      const chunks: Buffer[] = [];
      for await (const chunk of stored.stream) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
      const content = Buffer.concat(chunks);
      if (total + content.byteLength > MAX_ATTACHMENT_BYTES) {
        notAttached.push(f.filename);
        continue;
      }
      total += content.byteLength;
      attached.push({ filename: f.filename, content, contentType: f.contentType });
    } catch {
      notAttached.push(f.filename);
    }
  }
  return { attached, notAttached };
};

export const buildClientEmail = (ctx: ClientEmailContext, notAttached: string[]) => {
  const r = ctx.request;
  const rows: [string, string][] = [
    ["Reference", r.number],
    ["Project", `${ctx.projectName} (${r.projectCode})`],
    ["Discipline", r.discipline],
    ["Drawing sheet no.", r.sheetNumbers || "—"],
    ["Section(s) referenced", r.sectionsReferenced || "—"],
    ["Overview", r.subject],
    ["Clarification required", r.requestText],
    ["Cost impact", impactLine(r.costImpact, r.costNote, null, "cost")],
    ["Time impact", impactLine(r.timeImpact, null, r.timeDays, "time")],
    ["Please respond by", longDate(r.dueDate)],
  ];
  const kindLabel = r.kind === "RFI" ? "Request for Information" : "Request for Approval";
  const sender = `${ctx.senderName}, ${r.requestedByRole}`;
  const replyNote = ctx.replyUrl ? "You do not need an account: use the link to type your answer and attach files." : "";
  const attachmentNote = notAttached.length
    ? `The following files are too large to attach; full files available on request: ${notAttached.join(", ")}`
    : "";

  const text = [
    `${kindLabel} ${r.number}`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(attachmentNote ? ["", attachmentNote] : []),
    ...(ctx.replyUrl ? ["", `Reply to this request: ${ctx.replyUrl}`, replyNote] : []),
    "",
    `Sent by ${sender}.`,
    `Please reply to this email; your reply goes to ${ctx.senderEmail}.`,
  ].join("\n");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;max-width:640px">
<h2 style="margin:0 0 12px">${escapeHtml(kindLabel)} ${escapeHtml(r.number)}</h2>
<table style="border-collapse:collapse;width:100%">
${rows
  .map(
    ([k, v]) =>
      `<tr><td style="padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;white-space:nowrap;vertical-align:top"><b>${escapeHtml(k)}</b></td><td style="padding:6px 10px;border:1px solid #e5e7eb;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`,
  )
  .join("\n")}
</table>
${attachmentNote ? `<p>${escapeHtml(attachmentNote)}</p>` : ""}
${
  ctx.replyUrl
    ? `<p style="margin:18px 0"><a href="${escapeHtml(ctx.replyUrl)}" style="background:#15803d;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Reply to this request</a></p><p style="color:#4b5563">${escapeHtml(replyNote)}<br>If the button does not work, open this address: ${escapeHtml(ctx.replyUrl)}</p>`
    : ""
}
<p>Sent by ${escapeHtml(sender)}.<br>Please reply to this email; your reply goes to ${escapeHtml(ctx.senderEmail)}.</p>
</div>`;

  return { text, html };
};

/**
 * Sends one copy; throws whatever the mailer throws (including its 503 when mail is not configured).
 * Pass `prepared` when sending the same request to several people so the files are read only once.
 */
export const sendClientEmail = async (ctx: ClientEmailContext, prepared?: PreparedAttachments): Promise<void> => {
  const { attached, notAttached } = prepared ?? (await collectAttachments(ctx.files));
  const { text, html } = buildClientEmail(ctx, notAttached);
  await sendMail({
    to: ctx.to,
    cc: ctx.senderEmail,
    replyTo: ctx.senderEmail,
    subject: buildSubject(ctx.request),
    text,
    html,
    attachments: attached,
  });
};
