import { AppError, ConflictError, NotFoundError } from "../core/utils/errors.js";
import { findNameMatches } from "../reference/names.js";
import * as repo from "./repository.js";
import { asc } from "drizzle-orm";
import { employees } from "../core/db/schema/employees.js";
import { orderByFor, paginate, type PageRequest } from "../core/utils/pagination.js";

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
  // direct, non-guessing lookup.
  const byEmail = await repo.findByEmail(email);
  if (!byEmail) {
    throw new NotFoundError(
      "Employee record",
      `linked to account ${email} — ask HR to add or link one`,
    );
  }
  return repo.update(byEmail.id, { userId } as any);
};

export const update = async (
  id: number,
  input: UpdateEmployeeInput,
) => {
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

  const patch: UpdateEmployeeInput & {
    initials?: string;
  } = {
    ...input,
  };

  if (input.name) {
    patch.initials = initialsFrom(input.name);
  }

  const updated = await repo.update(id, patch);

  if (!updated) {
    throw new NotFoundError("Employee", String(id));
  }

  return updated;
};

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
  return update(id, {
    status: "Archived",
  });
};