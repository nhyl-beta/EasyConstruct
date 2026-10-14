import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/services/api.client";

/** A file the Architect submitted with a proposal (server: GET /proposals/:id/files). */
export interface ProposalFile {
  id: number;
  name: string;
  label: string;
  url: string;
  size: string | null;
  uploadedBy: string;
  stage: string | null;
  filedAt: string | null;
  /** False when the row exists but its stored bytes are gone (uploaded to ephemeral disk earlier). */
  available?: boolean;
}

export function useProposalFiles(proposalId: number | null) {
  const [files, setFiles] = useState<ProposalFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Never show another proposal's files while this one loads.
    setFiles([]);
    if (proposalId == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .get(`/proposals/${proposalId}/files`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((json: any) => {
        if (!cancelled) setFiles(Array.isArray(json?.data) ? json.data : []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the proposal's files.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [proposalId, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { files, loading, error, reload };
}
