import { useEffect, useState } from "react";
import { apiClient } from "@/services/api.client";

export interface RelatedCandidate {
  type: "proposal" | "design";
  id: number;
  label: string;
}

/** Proposals and designs on one project, for an advisory document's "Related to" select. */
export function useRelatedCandidates(project: string) {
  const [candidates, setCandidates] = useState<RelatedCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!project) {
      setCandidates([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiClient.get("/proposals"),
      apiClient.get(`/designs?projectCode=${encodeURIComponent(project)}`),
    ])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(([proposalsJson, designsJson]: any[]) => {
        if (cancelled) return;
        const proposals: { id: number; proposalId: string; title: string; projectCode: string }[] = proposalsJson?.data ?? [];
        const designs: { id: number; code: string; name: string; projectCode: string }[] = designsJson?.data ?? [];
        setCandidates([
          ...proposals
            .filter((p) => p.projectCode === project)
            .map((p) => ({ type: "proposal" as const, id: p.id, label: `Proposal · ${p.proposalId} · ${p.title}` })),
          ...designs
            .filter((d) => d.projectCode === project)
            .map((d) => ({ type: "design" as const, id: d.id, label: `Design · ${d.code} · ${d.name}` })),
        ]);
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project]);

  return { candidates, loading };
}
