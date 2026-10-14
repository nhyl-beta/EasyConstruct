// client/src/features/proposals/hooks/useDesignProposalSubmission.ts
//
// Submitting a design proposal and opening its approval workflow are one
// server call (POST /api/proposals/submit — see server/src/proposals/service.ts
// submit()), which also links proposals.workflow_id (D2).
//
// The optional file is a SECOND request (it needs the workflow id). If it fails the
// proposal and workflow already exist, so nothing is rolled back; instead the failure is
// kept as `pendingUpload` (with the File still in memory) so the Architect can press
// "Retry upload", or attach a file later from the proposals table with `attachFile`.
import { useCallback, useState } from "react";

import { WorkflowRepository } from "@/features/workflows/repositories/workflow.repository";
import type { Workflow } from "@/features/workflows/types/workflow.types";
import type { Proposal } from "../types/proposal.types";
import type { CreateProposalInput } from "../controllers/proposal.controller";

export interface DesignProposalSubmissionResult {
  proposal: Proposal;
  /** null when the proposal saved but the workflow could not be opened. */
  workflow: Workflow | null;
  /** True when the proposal saved with the file attached (or no file was chosen). */
  fileAttached: boolean;
}

/** A file that did not upload, kept so it can be retried. */
export interface PendingUpload {
  proposalId: string;
  workflowId: number;
  file: File;
  message: string;
}

const messageOf = (err: unknown) =>
  err instanceof Error && err.message
    ? err.message
    : "The file could not be uploaded.";

export function useDesignProposalSubmission(
  submitProposal: (
    input: CreateProposalInput,
  ) => Promise<{ proposal: Proposal; workflow: Workflow } | null>,
) {
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [uploadedNotice, setUploadedNotice] = useState<string | null>(null);

  const submit = useCallback(
    async (
      input: CreateProposalInput,
      file?: File | null,
    ): Promise<DesignProposalSubmissionResult | null> => {
      setSubmitting(true);
      setPendingUpload(null);
      setUploadedNotice(null);

      try {
        const result = await submitProposal(input);
        if (!result) return null;

        let workflow: Workflow | null = result.workflow;
        let fileAttached = true;

        if (file) {
          try {
            workflow = await WorkflowRepository.uploadAttachment(result.workflow.id, file, file.name);
          } catch (uploadErr) {
            fileAttached = false;
            setPendingUpload({
              proposalId: result.proposal.proposalId,
              workflowId: result.workflow.id,
              file,
              message: messageOf(uploadErr),
            });
          }
        }

        return { proposal: result.proposal, workflow, fileAttached };
      } finally {
        setSubmitting(false);
      }
    },
    [submitProposal],
  );

  /** Uploads a file to an existing proposal's workflow. Returns true when it was stored. */
  const attachFile = useCallback(async (proposalId: string, workflowId: number, file: File): Promise<boolean> => {
    setUploading(true);
    setUploadedNotice(null);
    try {
      await WorkflowRepository.uploadAttachment(workflowId, file, file.name);
      setPendingUpload(null);
      setUploadedNotice(`${file.name} was attached to ${proposalId}.`);
      return true;
    } catch (err) {
      setPendingUpload({ proposalId, workflowId, file, message: messageOf(err) });
      return false;
    } finally {
      setUploading(false);
    }
  }, []);

  const retryUpload = useCallback(async () => {
    if (!pendingUpload) return false;
    return attachFile(pendingUpload.proposalId, pendingUpload.workflowId, pendingUpload.file);
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
