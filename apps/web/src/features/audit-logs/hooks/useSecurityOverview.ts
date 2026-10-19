import { useCallback, useEffect, useState } from "react";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import type { SecurityOverview } from "../types/audit-log.types";

export function useSecurityOverview() {
  const [data, setData] = useState<SecurityOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await AuditLogRepository.securityOverview());
    } catch (err) {
      setError(
        err instanceof Error
          ? err
          : new Error("Failed to load the security overview."),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    sessions: data?.sessions ?? [],
    failedLogins: data?.failedLogins ?? [],
    totalFailedLogins: data?.totalFailedLogins ?? data?.failedLogins.length ?? 0,
    failedLoginsLimit: data?.failedLoginsLimit ?? 0,
    loading,
    error,
    reload,
  } as const;
}
