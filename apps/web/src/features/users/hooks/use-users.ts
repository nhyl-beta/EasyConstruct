import { useCallback, useEffect, useState } from "react";
import {
  UserRepository,
  type CreateUserInput,
  type PublicUser,
  type UpdateUserInput,
} from "../repositories/user.repository";

export function useUsers() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await UserRepository.list();
      setUsers(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to load users."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // The mutations rethrow so the calling screen can surface the server's
  // message (duplicate email, unknown role, self-deactivation) inline.
  const create = useCallback(
    async (input: CreateUserInput) => {
      const created = await UserRepository.create(input);
      await reload();
      return created;
    },
    [reload],
  );

  const update = useCallback(
    async (id: number, input: UpdateUserInput) => {
      const updated = await UserRepository.update(id, input);
      await reload();
      return updated;
    },
    [reload],
  );

  // No reload afterwards: a password change alters nothing the list renders,
  // and re-fetching would only cost a round trip.
  const setPassword = useCallback(
    async (id: number, password: string) => UserRepository.setPassword(id, password),
    [],
  );

  const setActive = useCallback(
    async (id: number, isActive: boolean) => {
      const updated = await UserRepository.setActive(id, isActive);
      await reload();
      return updated;
    },
    [reload],
  );

  const remove = useCallback(
    async (id: number) => {
      const deleted = await UserRepository.remove(id);
      await reload();
      return deleted;
    },
    [reload],
  );

  return {
    users,
    loading,
    error,
    reload,
    create,
    update,
    setPassword,
    setActive,
    remove,
  } as const;
}
