import { create as createAuditLog } from "../audit-logs/repository.js";
import type { CreateAuditLogInput } from "../audit-logs/types.js";

// Fire-and-forget audit write: a logging failure must never fail the
// primary action it's recording, so errors are swallowed (not silently
// ignored — logged to stderr for operability).
export async function logAudit(input: CreateAuditLogInput) {
  try {
    await createAuditLog(input);
  } catch (err) {
    console.error("[audit] failed to record entry", input, err);
  }
}
