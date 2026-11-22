// apps/web/src/features/proposals/hooks/useDesignProposalSubmission.ts
//
// Submitting a design proposal, opening its approval workflow, AND filing its
// required Bill of Materials file are now one atomic server call (POST
// /api/proposals/submit — see apps/api/src/proposals/service.ts submit()):
// the file travels in the same multipart request, and the server parses it
// to compute the estimated amount — never a second, separate upload step.
//
// `attachFile`/`retryUpload`/`pendingUpload` below are for a DIFFERENT,
// still-two-step flow: attaching a (non-BOQ) file to an *already submitted*
// proposal from the proposals table (architect-proposals.tsx's register-row
// AttachFileButton). That use case still needs the upload-can-fail-after-
// creation recovery path, so it is left untouched.
import { useCallback, useState } from "react";

import { WorkflowRepository } from "@/features/workflows/repositories/workflow.repository";
import type { Workflow } from "@/features/workflows/types/workflow.types";
import type { Proposal } from "../types/proposal.types";
import type { CreateProposalInput } from "../controllers/proposal.controller";

export interface DesignProposalSubmissionResult {
  proposal: Proposal;
  /** null when the proposal saved but the workflow could not be opened. */
  workflow: Workflow | null;
}

/** A file that did not upload, kept so it can be retried. */
export interface PendingUpload {
  proposalId: string;
  workflowId: number;
  file: File;
  fileLabel?: string;
  message: string;
}

const messageOf = (err: unknown) =>
  err instanceof Error && err.message
    ? err.message
    : "The file could not be uploaded.";

export function useDesignProposalSubmission(
  submitProposal: (
    input: CreateProposalInput,
    file: File,
  ) => Promise<{ proposal: Proposal; workflow: Workflow } | null>,
) {
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [uploadedNotice, setUploadedNotice] = useState<string | null>(null);

  const submit = useCallback(
    async (
      input: CreateProposalInput,
      file: File,
    ): Promise<DesignProposalSubmissionResult | null> => {
      setSubmitting(true);

      try {
        const result = await submitProposal(input, file);
        if (!result) return null;
        return { proposal: result.proposal, workflow: result.workflow };
      } finally {
        setSubmitting(false);
      }
    },
    [submitProposal],
  );

  /** Uploads a file to an existing proposal's workflow. Returns true when it was stored. */
  const attachFile = useCallback(async (proposalId: string, workflowId: number, file: File, fileLabel?: string): Promise<boolean> => {
    setUploading(true);
    setUploadedNotice(null);
    try {
      await WorkflowRepository.uploadAttachment(workflowId, file, fileLabel?.trim() || file.name);
      setPendingUpload(null);
      setUploadedNotice(`${file.name} was attached to ${proposalId}.`);
      return true;
    } catch (err) {
      setPendingUpload({ proposalId, workflowId, file, fileLabel, message: messageOf(err) });
      return false;
    } finally {
      setUploading(false);
    }
  }, []);

  const retryUpload = useCallback(async () => {
    if (!pendingUpload) return false;
    return attachFile(pendingUpload.proposalId, pendingUpload.workflowId, pendingUpload.file, pendingUpload.fileLabel);
  }, [pendingUpload, attachFile]);

  return {
    submit,
    submitting,
    uploading,
    /** Set when a proposal saved but its file did not upload. Cleared by a successful retry. */
    pendingUpload,
    retryUpload,
    attachFile,
    dismissPendingUpload: () => setPendingUpload(null),
    /** Shown after a retry or a later attach succeeds. */
    uploadedNotice,
  } as const;
}
