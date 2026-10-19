import { useCallback, useEffect, useState } from "react";
import { RoleRepository } from "../repositories/role.repository";
import type { Role } from "../types/role.types";

export function useRoles() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await RoleRepository.list();
      setRoles(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to load roles."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { roles, loading, error, reload } as const;
}
