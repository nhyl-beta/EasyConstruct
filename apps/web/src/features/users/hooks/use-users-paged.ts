import { useCallback } from "react";
import { useServerList } from "@/hooks/use-server-list";
import { qk } from "@/lib/query-keys";
import { apiClient } from "@/services/api.client";
import {
  UserRepository,
  type CreateUserInput,
  type PublicUser,
  type UpdateUserInput,
} from "../repositories/user.repository";

/**
 * The accounts table: server-side search, role filter and pagination.
 * Writes go through apiClient, which invalidates the "users" queries, so the
 * visible page refreshes without a manual reload.
 */
export function useUsersPaged(role: string | null) {
  const list = useServerList<PublicUser>({
    key: (params) => qk.users.list(params),
    filters: { role: role ?? "" },
    fetchPage: async (params, signal) => {
      const qs = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
      if (params.search) qs.set("search", params.search);
      if (role) qs.set("role", role);
      const json = await apiClient.get(`/users?${qs.toString()}`, { signal });
      return {
        items: (json?.data ?? []) as PublicUser[],
        total: json?.meta?.total ?? 0,
        pages: json?.meta?.pages,
      };
    },
  });

  const create = useCallback((input: CreateUserInput) => UserRepository.create(input), []);
  const update = useCallback((id: number, input: UpdateUserInput) => UserRepository.update(id, input), []);
  const setPassword = useCallback((id: number, password: string) => UserRepository.setPassword(id, password), []);
  const setActive = useCallback((id: number, isActive: boolean) => UserRepository.setActive(id, isActive), []);
  const remove = useCallback((id: number) => UserRepository.remove(id), []);

  return { list, create, update, setPassword, setActive, remove };
}
