import { useCallback, useEffect, useState } from "react";
import { AuditLogRepository } from "../repositories/audit-log.repository";
import type { AuditLog, AuditLogsQuery } from "../types/audit-log.types";

export function useAuditLogs(query: AuditLogsQuery = {}) {
  const {
    entityType,
    entityId,
    projectCode,
    actions,
    search,
    actor,
    dateFrom,
    dateTo,
    page,
    perPage,
  } = query;
  const actionsKey = actions?.join(",");

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await AuditLogRepository.list({
        entityType,
        entityId,
        projectCode,
        actions: actionsKey ? actionsKey.split(",") : undefined,
        search,
        actor,
        dateFrom,
        dateTo,
        page,
        perPage,
      });
      setLogs(result.data);
      setTotal(result.total);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("Failed to load activity logs."),
      );
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId, projectCode, actionsKey, search, actor, dateFrom, dateTo, page, perPage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { logs, total, loading, error, reload } as const;
}
