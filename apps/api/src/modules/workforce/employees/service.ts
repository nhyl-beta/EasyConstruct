import { AppError, ConflictError, NotFoundError, ValidationError } from "../../../core/utils/errors.js";
import { findNameMatches } from "../../platform/index.js";
import { needsOwnerApproval, registerExecutor, requestOwnerApproval } from "../../iam/index.js";
import * as repo from "./repository.js";
import { asc } from "drizzle-orm";
import { employees } from "../../../core/db/schema/employees.js";
import { orderByFor, paginate, type PageRequest } from "../../../core/utils/pagination.js";

import type {
  CreateEmployeeInput,
  EmployeeFilters,
  UpdateEmployeeInput,
} from "./types.js";

// Frontend forms send a full "name" (no initials field), so we derive
// initials server-side — first letter of first name + first letter of last name.
function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "NA";
  }

  const firstName = parts.at(0);
  const lastName = parts.at(-1);

  if (!firstName) {
    return "NA";
  }

  if (!lastName || parts.length === 1) {
    return firstName.slice(0, 2).toUpperCase();
  }

  const firstInitial = firstName.charAt(0);
  const lastInitial = lastName.charAt(0);

  return `${firstInitial}${lastInitial}`.toUpperCase();
}

export const getAll = async (filters: EmployeeFilters = {}) => {
  return await repo.findAll(filters);
};

export const getPage = async (filters: EmployeeFilters, request: PageRequest) =>
  paginate(
    request,
    () => repo.countFiltered(filters),
    (window) =>
      repo.findPage(
        filters,
        window,
        orderByFor(request, repo.EMPLOYEE_SORT_COLUMNS, repo.defaultEmployeeOrder.map((c) => asc(c)), employees.id),
      ),
  );

export const getById = async (id: number) => {
  const employee = await repo.findById(id);

  if (!employee) {
    throw new NotFoundError("Employee", String(id));
  }

  return employee;
};

export const create = async (rawInput: CreateEmployeeInput) => {
  const { confirmDuplicate, ...input } = rawInput;
  const existingId = await repo.findByEmployeeId(input.employeeId);

  if (existingId) {
    throw new ConflictError(
      `Employee ID ${input.employeeId} is already in use`,
    );
  }

  if (input.email) {
    const existingEmail = await repo.findByEmail(input.email);

    if (existingEmail) {
      throw new ConflictError(
        `Email ${input.email} is already in use`,
      );
    }
  }

  // Fix 1.2: the same or a very similar name is stopped with the matches unless
  // HR confirms it is a different person (two people can share a name).
  if (!confirmDuplicate) {
    const everyone = await repo.findAll();
    const matches = findNameMatches(
      input.name,
      everyone.map((e) => ({ id: e.id, name: e.name })),
    );
    if (matches.length > 0) {
      const byId = new Map(everyone.map((e) => [e.id, e]));
      throw new AppError(
        409,
        "DUPLICATE_NAME",
        `An employee with the same or a very similar name already exists: ${matches
          .map((m) => `${m.name} (${byId.get(m.id)?.employeeId})`)
          .join(", ")}. Confirm this is a different person to continue.`,
        { matches: matches.map((m) => ({ ...m, employeeId: byId.get(m.id)?.employeeId })) },
      );
    }
  }

  const created = await repo.create({
    ...input,
    email: input.email || undefined,
    phone: input.phone || undefined,
    initials: initialsFrom(input.name),
  });

  if (!created) {
    throw new Error("Failed to create employee");
  }

  return created;
};

export const getMyEmployeeRecord = async (userId: number, email: string) => {
  const byUserId = await repo.findByUserId(userId);
  if (byUserId) return byUserId;

  // Self-healing fallback: first time this user's record is looked up,
  // resolve it by email once and persist the FK so every future call is a
  // direct, non-guessing lookup. Accounts are now created from an employee
  // (users/service.ts create), so this only fires for accounts that predate the
  // strict link and have not been through `npm run db:backfill-employee-links`.
  const byEmail = await repo.findByEmail(email);
  if (byEmail) {
    console.warn(`[employees] linked account ${userId} (${email}) to ${byEmail.employeeId} by email fallback; run db:backfill-employee-links`);
  }
  if (!byEmail) {
    throw new NotFoundError(
      "Employee record",
      `linked to account ${email} — ask HR to add or link one`,
    );
  }
  return repo.update(byEmail.id, { userId } as any);
};

/** Who is making the edit. Changing the name or email of the Owner's record needs the Owner's approval by email. */
export interface Actor {
  id: number;
  name: string;
  role: string;
}

/** Every check an employee edit must pass, then the patch to write. No gate here. */
const plan = async (id: number, input: UpdateEmployeeInput) => {
  const existing = await getById(id);

  if (
    input.employeeId &&
    input.employeeId !== existing.employeeId
  ) {
    const duplicate = await repo.findByEmployeeId(input.employeeId);

    if (duplicate) {
      throw new ConflictError(
        `Employee ID ${input.employeeId} is already in use`,
      );
    }
  }

  if (
    input.email &&
    input.email !== existing.email
  ) {
    const duplicate = await repo.findByEmail(input.email);

    if (duplicate) {
      throw new ConflictError(
        `Email ${input.email} is already in use`,
      );
    }
  }

  // A linked employee and its account share a name and an email. Block an edit that would break
  // that (no email, or an email another account already uses) before anything is written.
  if (existing.userId != null && input.email !== undefined && input.email !== existing.email) {
    if (!input.email) {
      throw new ValidationError("This employee has an account, so their email cannot be removed");
    }
    const owner = await repo.findUserByEmail(input.email);
    if (owner && owner.id !== existing.userId) {
      throw new ConflictError(`Email ${input.email} is already used by another account`);
    }
  }

  const patch: UpdateEmployeeInput & {
    initials?: string;
  } = {
    ...input,
  };

  if (input.name) {
    patch.initials = initialsFrom(input.name);
  }

  return { existing, patch };
};

const commit = async (
  id: number,
  input: UpdateEmployeeInput,
  { existing, patch }: Awaited<ReturnType<typeof plan>>,
) => {
  const updated = await repo.update(id, patch);

  if (!updated) {
    throw new NotFoundError("Employee", String(id));
  }

  if (existing.userId != null) {
    await repo.syncLinkedUser(existing.userId, {
      name: input.name && input.name !== existing.name ? input.name : undefined,
      email: input.email && input.email !== existing.email ? input.email : undefined,
    });
  }

  return updated;
};

/** The edit with no approval gate. Only this module and the approval executor call it. */
const applyUpdate = async (id: number, input: UpdateEmployeeInput) => commit(id, input, await plan(id, input));

export const update = async (id: number, input: UpdateEmployeeInput, actor: Actor) => {
  const planned = await plan(id, input);
  const { existing } = planned;

  // The HR edit of a linked record copies its name and email onto the login account. For the Owner's record that
  // would change the Owner's login and the address approval emails go to, so it waits for the Owner's approval.
  const nameChange = input.name !== undefined && input.name !== existing.name;
  const emailChange = input.email !== undefined && input.email !== existing.email;
  if (existing.userId != null && (nameChange || emailChange)) {
    const linked = await repo.findLinkedUser(existing.userId);
    if (linked && needsOwnerApproval(linked, actor)) {
      return requestOwnerApproval({
        targetUserId: linked.id,
        action: "change_identity",
        payload: {
          employeeId: id,
          ...(nameChange ? { name: input.name } : {}),
          ...(emailChange ? { email: input.email } : {}),
          from: { name: linked.name, email: linked.email },
        },
        requester: actor,
      });
    }
  }

  return commit(id, input, planned);
};

registerExecutor("employee_identity", async (r) => {
  const p = (r.payload ?? {}) as { employeeId?: number; name?: string; email?: string };
  if (p.employeeId == null) throw new Error("The stored request has no employee record");
  await applyUpdate(p.employeeId, { ...(p.name !== undefined ? { name: p.name } : {}), ...(p.email !== undefined ? { email: p.email } : {}) });
});

export const remove = async (id: number) => {
  await getById(id);

  const deleted = await repo.remove(id);

  if (!deleted) {
    throw new NotFoundError("Employee", String(id));
  }

  return deleted;
};

// "Deactivate" per the spec is a soft delete: flips status to Archived
// rather than removing the row, so attendance/payroll history stays intact.
export const deactivate = async (id: number) => {
  // Status only: no name or email changes, so there is nothing for the Owner to approve.
  return applyUpdate(id, {
    status: "Archived",
  });
};