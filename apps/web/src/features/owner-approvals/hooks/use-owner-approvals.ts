import { useCallback, useEffect, useState } from "react";
import { ownerApprovalsRepository, type OwnerApprovalRequest } from "../repositories/owner-approvals.repository";

/** The caller's Owner-approval requests (everything for the Owner, their own for an IT Designer). */
export function useOwnerApprovals() {
  const [requests, setRequests] = useState<OwnerApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRequests(await ownerApprovalsRepository.list());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load approval requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const cancel = useCallback(
    async (id: number) => {
      await ownerApprovalsRepository.cancel(id);
      await refresh();
    },
    [refresh],
  );

  return { requests, loading, error, refresh, cancel };
}
