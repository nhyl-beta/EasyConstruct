import bcrypt from "bcryptjs";

import { count, eq } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { employees } from "../../../core/db/schema/employees.js";
import { projectMembers } from "../../../core/db/schema/project-members.js";
import { tasks } from "../../../core/db/schema/task.js";
import * as roleRepo from "../roles/repository.js";
import { ConflictError, NotFoundError, ValidationError } from "../../../core/utils/errors.js";
import * as repo from "./repository.js";
import { assertEmployeeLinkable, assertLinkEmailsMatch } from "./linking.js";
import { invalidateSessionCache } from "../../../core/auth/middleware.js";
import { registerExecutor } from "../owner-approvals/executors.js";
import { needsOwnerApproval } from "../owner-approvals/rules.js";
import * as ownerApprovals from "../owner-approvals/service.js";
import { users as usersTable } from "../../../core/db/schema/users.js";
import { orderByFor, paginate, type PageRequest } from "../../../core/utils/pagination.js";
import type {
  CreateUserInput,
  UpdateUserInput,
  UserFilters,
} from "./types.js";

const PASSWORD_SALT_ROUNDS = 10;

/** Who is making the change. A change to the Owner account by anyone but the Owner is held for the Owner's approval. */
export interface Actor {
  id: number;
  name: string;
  role: string;
}

/** What a gated change returns instead of the updated account (the controller answers 202). */
export type GatedResult<T> = T | ownerApprovals.PendingApproval;

export const getAll = async (filters: UserFilters) => repo.findAll(filters);

export const getPage = async (filters: UserFilters, request: PageRequest) =>
  paginate(
    request,
    () => repo.countFiltered(filters),
    (window) => repo.findPage(filters, window, orderByFor(request, repo.USER_SORT_COLUMNS, repo.defaultUserOrder, usersTable.id)),
  );

export const getById = async (id: number) => {
  const user = await repo.findById(id);
  if (!user) throw new NotFoundError("User", String(id));
  return user;
};

// `users.role` is a plain varchar, so nothing in the database stops a typo
// from creating an account whose role no requireRole() check will ever match.
// The roles table is the authoritative list, so validate against it.
const assertRoleExists = async (role: string) => {
  const existing = await roleRepo.findByName(role);
  if (!existing) {
    throw new ValidationError(`Unknown role '${role}'`);
  }
};

// B1: EasyConstruct has exactly one master Owner account. Enforced here
// (service-level, on every path that can produce a second owner) and again
// at the DB level (a partial unique index on users.role WHERE role='owner' —
// see db/ensure-demo-schema.ts) as a belt-and-suspenders guard against any
// write path that bypasses this service.
const assertOwnerSlotAvailable = async (excludeUserId?: number) => {
  const owners = await repo.findAll({ role: "owner" });
  const activeOthers = owners.filter((u) => u.isActive && u.id !== excludeUserId);
  if (activeOthers.length > 0) {
    throw new ValidationError("An owner account already exists — only one master account is allowed");
  }
};

// The mirror guard: block removing the only thing that can ever grant this
// role back, same reasoning as the existing self-deactivation/self-deletion
// guards below (the account that reverses a lockout can't be the one item
// disabled).
const assertNotLastActiveOwner = async (userId: number, role: string) => {
  if (role !== "owner") return;
  const owners = await repo.findAll({ role: "owner" });
  const activeOwners = owners.filter((u) => u.isActive);
  if (activeOwners.length <= 1 && activeOwners.some((u) => u.id === userId)) {
    throw new ValidationError("Cannot remove the last owner account");
  }
};

/**
 * Every account belongs to an employee. Name and email are copied from the employee record (so they cannot drift),
 * and the user row and employees.user_id are written in one transaction.
 */
export const create = async (input: CreateUserInput) => {
  const employee = await repo.findEmployeeById(input.employeeId);
  const email = assertEmployeeLinkable(employee, input.employeeId);
  await assertRoleExists(input.role);
  if (input.role === "owner") await assertOwnerSlotAvailable();

  if (await repo.findByEmail(email)) {
    throw new ConflictError(`A user with email ${email} already exists`);
  }

  const created = await repo.createLinkedToEmployee(
    {
      name: employee!.name,
      email,
      password: await bcrypt.hash(input.password, PASSWORD_SALT_ROUNDS),
      role: input.role,
    },
    employee!.id,
  );
  if (!created) throw new ConflictError("Could not create the user account");
  return { ...created, employee: { id: employee!.id, employeeId: employee!.employeeId, name: employee!.name } };
};

export const getLinkableEmployees = async (search?: string) => repo.findLinkableEmployees(search);

/** Link an existing, unlinked account to an unlinked Active employee (same rules as creating one). */
export const linkToEmployee = async (userId: number, employeeId: number) => {
  const user = await getById(userId);
  const existing = await repo.findEmployeeByUserId(userId);
  if (existing) {
    throw new ConflictError(`This account is already linked to ${existing.name} (${existing.employeeId})`);
  }
  const employee = await repo.findEmployeeById(employeeId);
  const email = assertEmployeeLinkable(employee, employeeId);
  assertLinkEmailsMatch(user.email, email, employee!);
  const linked = await repo.linkEmployee(userId, employee!.id);
  if (!linked) throw new ConflictError("That employee already has an account");
  return { user, employee: linked };
};

// Employee ids made for accounts that had no record yet: EMP-U0042 for user 42 (unique per user).
const employeeCodeFor = async (userId: number) => {
  const base = `EMP-U${String(userId).padStart(4, "0")}`;
  const taken = new Set((await repo.findEmployeeCodes(base)).map((r) => r.employeeId));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
};

const initialsOf = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).map((p) => p[0] ?? "").join("").slice(0, 2).toUpperCase() || "NA";

/**
 * "Create employee from this account": a starting record for someone who has an account but no employee yet. Name,
 * email and role come from the account; HR completes pay rate, department and site afterwards.
 */
export const createEmployeeFromAccount = async (userId: number) => {
  const user = await getById(userId);
  const existing = await repo.findEmployeeByUserId(userId);
  if (existing) {
    throw new ConflictError(`This account is already linked to ${existing.name} (${existing.employeeId})`);
  }
  const sameEmail = await db.select().from(employees).where(eq(employees.email, user.email));
  if (sameEmail.length > 0) {
    throw new ConflictError(
      `An employee record with email ${user.email} already exists (${sameEmail[0]!.employeeId}). Use "Link to employee" instead`,
    );
  }
  const roleRow = await roleRepo.findByName(user.role);
  const created = await repo.createEmployeeForUser({
    employeeId: await employeeCodeFor(userId),
    name: user.name,
    initials: initialsOf(user.name),
    role: roleRow?.label ?? user.role,
    department: "Unassigned",
    site: "Unassigned",
    hiredOn: new Date().toISOString().slice(0, 10),
    email: user.email,
    userId,
  });
  if (!created) throw new ConflictError("Could not create the employee record");
  return { user, employee: created };
};

/** All the checks an account update must pass. Run again at approval time, so a stale approval cannot slip a bad change through. */
const validateUpdate = async (id: number, input: UpdateUserInput, current: Awaited<ReturnType<typeof getById>>) => {
  if (input.role) await assertRoleExists(input.role);
  if (input.role === "owner" && current.role !== "owner") {
    await assertOwnerSlotAvailable(id);
  }
  if (input.role && input.role !== "owner" && current.role === "owner") {
    await assertNotLastActiveOwner(id, "owner");
  }

  // A linked account's name and email follow its employee record (HR edits them there and the account is
  // updated with it), so changing them here would make the two disagree.
  const changesIdentity =
    (input.name !== undefined && input.name !== current.name) || (input.email !== undefined && input.email !== current.email);
  if (changesIdentity && (await repo.findEmployeeByUserId(id))) {
    throw new ValidationError("This account is linked to an employee record. Change the name or email on the employee record instead");
  }

  if (input.email) {
    const owner = await repo.findByEmail(input.email);
    if (owner && owner.id !== id) {
      throw new ConflictError(`A user with email ${input.email} already exists`);
    }
  }
};

/** The update itself, with no approval gate. Only this module and the approval executors call it. */
const applyUpdate = async (id: number, input: UpdateUserInput) => {
  const current = await getById(id);
  await validateUpdate(id, input, current);
  const updated = await repo.update(id, input);
  if (!updated) throw new NotFoundError("User", String(id));
  return updated;
};

export const update = async (id: number, input: UpdateUserInput, actor: Actor) => {
  const current = await getById(id);

  if (needsOwnerApproval(current, actor)) {
    await validateUpdate(id, input, current);
    const roleChange = input.role !== undefined && input.role !== current.role;
    const nameChange = input.name !== undefined && input.name !== current.name;
    const emailChange = input.email !== undefined && input.email !== current.email;
    if (roleChange && (nameChange || emailChange)) {
      throw new ValidationError("Change the Owner's role and the Owner's name or email in separate requests");
    }
    if (roleChange) {
      return ownerApprovals.request({
        targetUserId: id,
        action: "change_role",
        payload: { role: input.role, fromRole: current.role },
        requester: actor,
      });
    }
    if (nameChange || emailChange) {
      return ownerApprovals.request({
        targetUserId: id,
        action: "change_identity",
        payload: {
          ...(nameChange ? { name: input.name } : {}),
          ...(emailChange ? { email: input.email } : {}),
          from: { name: current.name, email: current.email },
        },
        requester: actor,
      });
    }
    // Nothing about the Owner would change, so there is nothing to approve.
  }

  return applyUpdate(id, input);
};

/**
 * Administrative password reset: IT Designer sets a new password on any
 * account without needing the current one. The account-recovery flow
 * (POST /api/auth/forgot-password) stays the self-service path; this is the
 * one for people who can no longer reach the mailbox on the account.
 *
 * The plaintext never leaves this call — it is hashed here and the repository
 * only ever returns the public columns, so no hash is echoed back either.
 * For the Owner account the hash (never the plaintext) waits for the Owner's approval.
 */
export const setPassword = async (id: number, password: string, actor: Actor) => {
  const current = await getById(id);
  const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
  if (needsOwnerApproval(current, actor)) {
    return ownerApprovals.request({ targetUserId: id, action: "password_reset", payload: { passwordHash }, requester: actor });
  }
  return applySetPassword(id, passwordHash);
};

const applySetPassword = async (id: number, passwordHash: string) => {
  const updated = await repo.setPassword(id, passwordHash);
  if (!updated) throw new NotFoundError("User", String(id));
  invalidateSessionCache(id);
  return updated;
};

const applySetActive = async (id: number, isActive: boolean) => {
  const user = await getById(id);
  if (!isActive) await assertNotLastActiveOwner(id, user.role);

  const updated = await repo.setActive(id, isActive);
  // This process stops honoring the account's tokens now; other instances catch up within the session cache TTL.
  invalidateSessionCache(id);
  if (!updated) throw new NotFoundError("User", String(id));
  return updated;
};

export const setActive = async (id: number, isActive: boolean, actor: Actor) => {
  // Deactivating yourself would lock the only account that can reverse it out
  // of the system — the same fail-safe reasoning behind Owner's recovery flow.
  if (!isActive && id === actor.id) {
    throw new ValidationError("You cannot deactivate your own account");
  }

  const user = await getById(id);
  if (needsOwnerApproval(user, actor)) {
    if (!isActive) await assertNotLastActiveOwner(id, user.role);
    return ownerApprovals.request({ targetUserId: id, action: isActive ? "reactivate" : "deactivate", requester: actor });
  }
  return applySetActive(id, isActive);
};

/** Refuses unless the account may be deleted now (deactivated, nothing still pointing at it). */
const assertRemovable = async (id: number) => {
  const user = await getById(id);

  if (user.isActive) {
    throw new ValidationError(
      "Deactivate the account before deleting it",
    );
  }

  const blockers: string[] = [];

  const [employeeRef] = await db
    .select({ n: count() })
    .from(employees)
    .where(eq(employees.userId, id));
  if ((employeeRef?.n ?? 0) > 0) {
    const linked = await repo.findEmployeeByUserId(id);
    blockers.push(linked ? `the employee record of ${linked.name} (${linked.employeeId})` : "an employee record");
  }

  const [memberRef] = await db
    .select({ n: count() })
    .from(projectMembers)
    .where(eq(projectMembers.userId, id));
  if ((memberRef?.n ?? 0) > 0) blockers.push("project assignments");

  const [taskRef] = await db
    .select({ n: count() })
    .from(tasks)
    .where(eq(tasks.assignedToUserId, id));
  if ((taskRef?.n ?? 0) > 0) blockers.push("assigned tasks");

  if (blockers.length > 0) {
    throw new ConflictError(
      `This account still has ${blockers.join(", ")}. Reassign or remove those first — the account stays deactivated in the meantime.`,
    );
  }
  return user;
};

const applyRemove = async (id: number) => {
  await assertRemovable(id);
  const deleted = await repo.remove(id);
  if (!deleted) throw new NotFoundError("User", String(id));
  return deleted;
};

/**
 * Permanently delete an account.
 *
 * Deliberately narrow, because this is the one irreversible action on this
 * module:
 *  - only an already-deactivated account can be removed, so deletion is
 *    always a second, separate decision after access has been revoked;
 *  - it refuses while anything still references the row (employee record,
 *    project membership, assigned task) rather than cascading, so removing a
 *    user can never silently destroy HR or project history;
 *  - you cannot delete yourself;
 *  - the Owner account needs the Owner's approval by email first.
 *
 * Audit-log entries survive: audit_logs stores an actor *name*, not a user
 * FK, so the trail of what this person did remains intact.
 */
export const remove = async (id: number, actor: Actor) => {
  if (id === actor.id) {
    throw new ValidationError("You cannot delete your own account");
  }

  const user = await getById(id);
  if (needsOwnerApproval(user, actor)) {
    await assertRemovable(id);
    return ownerApprovals.request({ targetUserId: id, action: "delete", requester: actor });
  }
  return applyRemove(id);
};

// What runs when the Owner approves. These are the ungated functions above, so every guard (last owner, unique email,
// removable account) and the session invalidation still apply at the moment of execution.
registerExecutor("deactivate", async (r) => void (await applySetActive(r.targetUserId, false)));
registerExecutor("reactivate", async (r) => void (await applySetActive(r.targetUserId, true)));
registerExecutor("password_reset", async (r) => {
  const hash = (r.payload as { passwordHash?: string } | null)?.passwordHash;
  if (!hash) throw new Error("The stored request has no password");
  await applySetPassword(r.targetUserId, hash);
});
registerExecutor("change_role", async (r) => {
  const role = (r.payload as { role?: string } | null)?.role;
  if (!role) throw new Error("The stored request has no role");
  await applyUpdate(r.targetUserId, { role });
});
registerExecutor("change_identity", async (r) => {
  const p = (r.payload ?? {}) as { name?: string; email?: string };
  await applyUpdate(r.targetUserId, { ...(p.name !== undefined ? { name: p.name } : {}), ...(p.email !== undefined ? { email: p.email } : {}) });
});
registerExecutor("delete", async (r) => void (await applyRemove(r.targetUserId)));
