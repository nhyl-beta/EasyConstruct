import * as repo         from "./repository.js";
import { NotFoundError } from "../core/utils/errors.js";

export const getAll = async () => {
  return await repo.findAll();
};

export const getById = async (id: number) => {
  const role = await repo.findById(id);
  if (!role) throw new NotFoundError("Role", String(id));
  return role;
};

export interface RoleAccountSummary {
  role: string;
  activeUsers: number;
  users: { id: number; name: string; email: string; isActive: boolean }[];
}

/** Active-user count and account list per role, for the Roles & Permissions page. */
export const getAccountSummary = async (): Promise<RoleAccountSummary[]> => {
  const accounts = await repo.findAccountsByRole();
  const byRole = new Map<string, RoleAccountSummary>();
  for (const a of accounts) {
    const entry = byRole.get(a.role) ?? { role: a.role, activeUsers: 0, users: [] };
    entry.users.push({ id: a.id, name: a.name, email: a.email, isActive: a.isActive });
    if (a.isActive) entry.activeUsers += 1;
    byRole.set(a.role, entry);
  }
  return [...byRole.values()];
};
