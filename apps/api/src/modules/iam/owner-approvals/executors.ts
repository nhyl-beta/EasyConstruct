// What runs when the Owner approves. The users and employees services register their own (ungated) functions here
// instead of being imported by this module, which keeps the module graph free of cycles.
import type { OwnerActionRequest } from "../../../core/db/schema/owner-action-requests.js";

export type ExecutorKey = "deactivate" | "reactivate" | "password_reset" | "change_role" | "change_identity" | "delete" | "employee_identity";
export type Executor = (request: OwnerActionRequest) => Promise<void>;

const registry = new Map<ExecutorKey, Executor>();

export const registerExecutor = (key: ExecutorKey, run: Executor): void => {
  registry.set(key, run);
};

export const getExecutor = (key: ExecutorKey): Executor | undefined => registry.get(key);
