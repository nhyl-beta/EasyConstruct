import { useEffect, useState } from "react";
import { RoleAccountRepository, type RoleAccountSummary } from "../repositories/role.repository";

/** Active-user counts and account lists per role, keyed by role name. */
export function useRoleAccounts() {
  const [summary, setSummary] = useState<Record<string, RoleAccountSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    RoleAccountRepository.summary()
      .then((rows) => active && setSummary(Object.fromEntries(rows.map((r) => [r.role, r]))))
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : "Could not load user counts"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return { summary, loading, error } as const;
}
