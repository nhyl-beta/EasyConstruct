import { useEffect, useState } from "react";
import { UserRepository, type PublicUser } from "../repositories/user.repository";

/**
 * `enabled: false` skips the request entirely. Read-only viewers of a project
 * (Owner, Consultant, Architect) see the team roster but have no add control
 * and no grant on /api/users, so fetching candidates would only ever be a 403
 * in their console.
 */
export function useUsersByRole(
  role: string | null,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!role || !enabled) {
      setUsers([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    UserRepository.listByRole(role)
      .then((result) => {
        if (!cancelled) setUsers(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load users");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [role, enabled]);

  return { users, loading, error };
}
