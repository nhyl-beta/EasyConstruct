// Pure rules for the files shown with a proposal on the Consultant's review screen
// (GET /api/proposals/:id/files). No database access.
import { canAccessCode, isAssignedScoped, type ScopeAuth } from "../projects/scope.js";

export interface SubmittedProposalFile {
  id: number;
  name: string;
  label: string;
  url: string;
  size: string | null;
  uploadedBy: string;
  stage: string | null;
  filedAt: Date | null;
  /** False when the row exists but its bytes are gone (stored on ephemeral disk earlier). */
  available: boolean;
}

export interface AttachmentRow {
  attachment: {
    id: number;
    kind: string;
    label: string;
    fileName: string | null;
    fileUrl: string | null;
    fileSize: string | null;
    uploadedBy: string;
    createdAt: Date | null;
  };
  stageLabel: string | null;
}

/**
 * The files the Architect submitted: "document" attachments with a file url. Notes (the
 * proposal description) and rows without a file are not files. `isAvailable` says whether
 * the bytes can still be read.
 */
export function toSubmittedFiles(rows: AttachmentRow[], isAvailable: (url: string) => boolean = () => true): SubmittedProposalFile[] {
  return rows
    .filter(({ attachment }) => attachment.kind === "document" && !!attachment.fileUrl)
    .map(({ attachment, stageLabel }) => ({
      id: attachment.id,
      name: attachment.fileName ?? attachment.label,
      label: attachment.label,
      url: attachment.fileUrl as string,
      size: attachment.fileSize,
      uploadedBy: attachment.uploadedBy,
      stage: stageLabel ?? null,
      filedAt: attachment.createdAt,
      available: isAvailable(attachment.fileUrl as string),
    }));
}

/**
 * Who may read a proposal's files: everyone who is signed in, except an assigned-scoped
 * role (Architect), which only gets proposals of projects it is assigned to. The
 * Consultant is not assigned-scoped, so they see the files of the proposals they review.
 */
export function canSeeProposalFiles(auth: ScopeAuth | undefined, assignedCodes: ReadonlySet<string>, projectCode: string | null | undefined): boolean {
  if (!isAssignedScoped(auth)) return true;
  return canAccessCode(assignedCodes, projectCode);
}
