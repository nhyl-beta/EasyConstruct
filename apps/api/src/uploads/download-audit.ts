// apps/api/src/uploads/download-audit.ts: pure, no I/O (client demo change #3)
//
// The audit line for a file download. Who, which file (name and URL), which project when the file
// belongs to a document, and what happened. A download of a Legal-category document is recorded with
// its own action so Security Monitoring can list it.
import { createHash } from "node:crypto";
import type { CreateAuditLogInput } from "../audit-logs/types.js";

export const FILE_ENTITY = "file";
export const ACTION_DOWNLOADED = "downloaded";
export const ACTION_SENSITIVE_DOWNLOAD = "sensitive_download";
export const ACTION_DOWNLOAD_BLOCKED = "download_blocked";

export interface FileContext {
  documentId?: string;
  title?: string;
  project?: string;
  docType?: string;
}

export type DownloadResult = "ok" | "denied" | "not_found" | "failed";

/** The last path segment of a stored url, without the query string. */
export const fileNameOf = (url: string): string => {
  const path = url.split(/[?#]/)[0] ?? "";
  const last = path.split("/").filter(Boolean).pop() ?? url;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
};

/** audit_logs.entity_id is varchar(50): a document id when there is one, else a short fingerprint of the url. */
export const entityIdFor = (url: string, ctx?: FileContext | null): string =>
  ctx?.documentId ? ctx.documentId.slice(0, 50) : `f-${createHash("sha256").update(url).digest("hex").slice(0, 16)}`;

export const buildDownloadAudit = (input: {
  actor: string;
  url: string;
  ctx?: FileContext | null;
  sensitive: boolean;
  result: DownloadResult;
  reason?: string;
}): CreateAuditLogInput => {
  const { actor, url, ctx, sensitive, result } = input;
  const name = ctx?.title ? `${ctx.title} (${fileNameOf(url)})` : fileNameOf(url);
  const where = ctx?.project ? ` from project ${ctx.project}` : "";
  const kind = ctx?.docType ? `, type ${ctx.docType}` : "";
  const outcome = result === "ok" ? "" : ` - ${result === "denied" ? "refused" : result === "not_found" ? "file not found" : "failed"}${input.reason ? `: ${input.reason}` : ""}`;
  const action = result !== "ok" ? ACTION_DOWNLOAD_BLOCKED : sensitive ? ACTION_SENSITIVE_DOWNLOAD : ACTION_DOWNLOADED;
  return {
    entityType: FILE_ENTITY,
    entityId: entityIdFor(url, ctx),
    action,
    actor,
    summary: `${actor} downloaded ${sensitive ? "legal file " : "file "}"${name}"${where}${kind} [${url}]${outcome}`,
    ...(ctx?.project ? { projectCode: ctx.project } : {}),
  };
};
