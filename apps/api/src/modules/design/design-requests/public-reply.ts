// apps/api/src/design-requests/public-reply.ts (client demo change #6)
//
// What a stakeholder can do through the link in an RFI/RFA email, with no account: read the request, download
// its attachments, and send one answer. Everything is decided by the token alone, and the token is checked on
// every call (hashed, in date, unused). Every open, download, refusal and submit leaves an audit line.
import { env } from "../../../core/config/env.js";
import { notifications } from "../../platform/index.js";
import { projectsRepo } from "../../projects/index.js";
import { storeBuffer, openStoredFile } from "../../documents/index.js";
import { assertContentMatches } from "../../documents/index.js";
import { hasAllowedExtension } from "../../documents/index.js";
import { AppError, NotFoundError, ValidationError } from "../../../core/utils/errors.js";
import { logAudit } from "../../../core/audit/audit.js";
import * as repo from "./reply-repository.js";
import { CLIENT_ACTIVE_STATUSES } from "./rules.js";
import {
  REPLY_TEXT_MAX,
  REPLY_TEXT_MIN,
  TOKEN_MESSAGES,
  TOKEN_PATTERN,
  evaluateToken,
  expiryFor,
  fileBelongsToRequest,
  generateToken,
  hashToken,
  replyLimits,
  replyUrl,
  tokenDays,
} from "./reply-tokens.js";

export const limits = () => replyLimits({ files: process.env.RFI_REPLY_MAX_FILES, fileMb: process.env.RFI_REPLY_MAX_FILE_MB });
export const companyName = () => process.env.COMPANY_NAME?.trim() || "EasyConstruct";

/** A fresh link for one recipient (called when their email is sent or re-sent). Returns the full url. */
export const mintReplyLink = async (recipientId: number, now: Date = new Date()): Promise<string> => {
  const token = generateToken();
  await repo.insertToken(recipientId, hashToken(token), expiryFor(now, tokenDays(process.env.RFI_REPLY_TOKEN_DAYS)));
  return replyUrl(env.APP_URL, token);
};

export interface Caller {
  ip: string;
}

const actorLabel = (recipientName: string) => `Reply link: ${recipientName}`.slice(0, 100);

const refuse = (state: "missing" | "expired" | "used") => {
  const m = TOKEN_MESSAGES[state];
  return new AppError(m.status, m.code, m.message);
};

/**
 * Resolves a presented token to its recipient and request, or throws the friendly refusal. The token's shape is
 * checked first so junk never reaches the database; refusals are audited (without the token itself).
 */
const resolve = async (token: string, caller: Caller, opts: { allowUsed?: boolean } = {}) => {
  if (!TOKEN_PATTERN.test(token)) {
    await logAudit({ entityType: "rfi-reply", entityId: "unknown", action: "rejected", actor: "Reply link: unknown", summary: `Reply link refused (malformed) from ${caller.ip}` });
    throw refuse("missing");
  }
  const found = await repo.findByTokenHash(hashToken(token));
  const state = evaluateToken(found?.token, new Date());
  if (state !== "ok" && !(opts.allowUsed && state === "used")) {
    await logAudit({
      entityType: "rfi-reply",
      entityId: found ? String(found.request.id) : "unknown",
      action: "rejected",
      actor: actorLabel(found?.recipient.name ?? "unknown"),
      summary: `Reply link refused (${state}) from ${caller.ip}`,
      ...(found ? { projectCode: found.request.projectCode } : {}),
    });
    throw refuse(state as "missing" | "expired" | "used");
  }
  if (!found) throw refuse("missing");
  return found;
};

/** What the reply page shows. Only what the recipient needs: no internal ids, people or other recipients. */
export const openReply = async (token: string, caller: Caller) => {
  const { recipient, request } = await resolve(token, caller);
  const [project, files] = await Promise.all([projectsRepo.findByCode(request.projectCode), repo.findRequestFiles(request.id)]);
  await logAudit({
    entityType: "rfi-reply",
    entityId: String(request.id),
    action: "opened",
    actor: actorLabel(recipient.name),
    summary: `${request.number} reply link opened by ${recipient.name} from ${caller.ip}`,
    projectCode: request.projectCode,
  });
  const { maxFiles, maxFileBytes } = limits();
  return {
    companyName: companyName(),
    projectName: project?.name ?? request.projectCode,
    requestNumber: request.number,
    kind: request.kind,
    subject: request.subject,
    requestText: request.requestText,
    dueDate: request.dueDate,
    recipientName: recipient.name,
    acceptsReply: CLIENT_ACTIVE_STATUSES.has(request.status),
    attachments: files.map((f) => ({ id: f.id, filename: f.filename, contentType: f.contentType, sizeBytes: f.sizeBytes })),
    maxFiles,
    maxFileMb: Math.round(maxFileBytes / 1024 / 1024),
  };
};

/** An attachment of this request, opened with the token instead of a login. */
export const openAttachment = async (token: string, fileId: number, caller: Caller) => {
  const { recipient, request } = await resolve(token, caller);
  const file = await repo.findFile(fileId);
  // A file of any other request (or one of the answers) is indistinguishable from a file that is not there.
  if (!fileBelongsToRequest(file, request.id)) throw new NotFoundError("File");
  const stored = await openStoredFile(file!.url);
  await logAudit({
    entityType: "rfi-reply",
    entityId: String(request.id),
    action: "downloaded",
    actor: actorLabel(recipient.name),
    summary: `${recipient.name} downloaded "${file!.filename}" from ${request.number} via the reply link (${caller.ip})`,
    projectCode: request.projectCode,
  });
  return { file: file!, stored };
};

export interface IncomingFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface ReplyForm {
  answer: string;
  name: string;
  position: string;
}

/** Checks what was typed and attached before anything is stored; the same file rules as every other upload. */
export const validateReply = (form: ReplyForm, files: readonly IncomingFile[]): ReplyForm => {
  const answer = form.answer?.trim() ?? "";
  const name = form.name?.trim() ?? "";
  const position = form.position?.trim() ?? "";
  if (answer.length < REPLY_TEXT_MIN) throw new ValidationError("Please type your answer.");
  if (answer.length > REPLY_TEXT_MAX) throw new ValidationError(`Your answer is too long (at most ${REPLY_TEXT_MAX} characters).`);
  if (name.length < 2 || name.length > 100) throw new ValidationError("Please enter your name.");
  if (position.length < 2 || position.length > 100) throw new ValidationError("Please enter your position.");
  const { maxFiles, maxFileBytes } = limits();
  if (files.length > maxFiles) throw new ValidationError(`You can attach at most ${maxFiles} file${maxFiles === 1 ? "" : "s"}.`);
  for (const f of files) {
    if (f.size > maxFileBytes) throw new ValidationError(`"${f.originalname}" is larger than ${Math.round(maxFileBytes / 1024 / 1024)} MB.`);
    if (!hasAllowedExtension(f.originalname)) throw new ValidationError(`"${f.originalname}" is not a file type we accept.`);
    // The bytes must be what the name claims (a renamed program is not a PDF).
    assertContentMatches(f.originalname, f.mimetype || "", f.buffer);
  }
  return { answer, name, position };
};

export const submitReply = async (token: string, form: ReplyForm, files: readonly IncomingFile[], caller: Caller) => {
  const { token: tokenRow, recipient, request } = await resolve(token, caller);
  if (!CLIENT_ACTIVE_STATUSES.has(request.status)) {
    throw new AppError(410, "REPLY_CLOSED", "This request is no longer waiting for an answer. Please contact the sender.");
  }
  const clean = validateReply(form, files);
  const now = new Date();

  // Store the files first (each is fingerprinted like any upload), then claim the link. If someone else used the
  // link in between, the stored copies are simply not attached to anything.
  const stored = await Promise.all(
    files.map(async (f) => {
      const result = await storeBuffer({ buffer: f.buffer, filename: f.originalname, contentType: f.mimetype || "application/octet-stream" });
      return { url: result.url, filename: f.originalname.slice(0, 255), contentType: (f.mimetype || "application/octet-stream").slice(0, 100), sizeBytes: f.size };
    }),
  );
  if (!(await repo.claimToken(tokenRow.id, now))) throw refuse("used");

  await repo.saveReply({
    requestId: request.id,
    recipientId: recipient.id,
    responseText: clean.answer,
    responderName: clean.name,
    responderPosition: clean.position,
    now,
    markClientReplied: request.status === "open",
    files: stored,
  });

  await logAudit({
    entityType: "rfi-reply",
    entityId: String(request.id),
    action: "submitted",
    actor: actorLabel(recipient.name),
    summary: `${request.number} answered by ${clean.name} (${clean.position}) through the reply link: ${stored.length} file${stored.length === 1 ? "" : "s"} (${caller.ip})`,
    projectCode: request.projectCode,
  });

  // Tell the PM and the person who raised it, in the app.
  const title = `${request.number}: ${recipient.name} replied`;
  const body = `${clean.name}${clean.position ? `, ${clean.position}` : ""}: ${clean.answer.slice(0, 120)}`;
  const link = `/requests?open=${request.id}`;
  await Promise.allSettled([
    notifications.notifyProject(request.projectCode, ["project-manager"], { title, body, link }),
    request.requestedByUserId ? notifications.create({ recipientUserId: request.requestedByUserId, projectCode: request.projectCode, title, body, link }) : Promise.resolve(),
  ]);

  return { requestNumber: request.number, files: stored.length };
};
