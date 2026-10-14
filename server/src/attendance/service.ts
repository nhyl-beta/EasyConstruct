/*
 * server/src/attendance/service.ts
 */

import { eq } from "drizzle-orm";
import { attendance } from "../db/schema/attendance.js";
import { orderByFor, paginate, type PageRequest } from "../utils/pagination.js";
import { buildHeatmap, lastDays } from "./heatmap.js";

import { db } from "../db/connection.js";
import { projects } from "../db/schema/projects.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
import { assertProjectWritable } from "../lifecycle/service.js";
import * as employeesRepo from "../employees/repository.js";
import * as projectMemberRepo from "../project-members/repository.js";

import * as repo from "./repository.js";

import type {
  AttendanceFilters,
  CreateAttendanceInput,
  UpdateAttendanceInput,
} from "./types.js";

/**
 * Calculate worked hours from clock-in and clock-out times.
 *
 * Example:
 * 08:00 -> 17:00 = "9.0"
 *
 * Returns undefined when:
 * - clockOut is missing
 * - the time values are invalid
 * - the calculated duration is zero or negative
 */
function computeHours(
  clockIn: string,
  clockOut?: string,
): string | undefined {
  if (!clockOut) {
    return undefined;
  }

  const [inH = 0, inM = 0] = clockIn
    .split(":")
    .map(Number);

  const [outH = 0, outM = 0] = clockOut
    .split(":")
    .map(Number);

  const values = [inH, inM, outH, outM];

  if (values.some((value) => Number.isNaN(value))) {
    return undefined;
  }

  const minutes =
    outH * 60 +
    outM -
    (inH * 60 + inM);

  if (minutes <= 0) {
    return undefined;
  }

  return (minutes / 60).toFixed(1);
}

/**
 * Calculate the distance between two latitude/longitude
 * coordinates using the Haversine formula.
 *
 * Result is returned in meters.
 */
function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;

  const toRad = (degrees: number) =>
    (degrees * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return (
    R *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a),
    )
  );
}

/**
 * Get all attendance records.
 */
export const getAll = async (
  filters: AttendanceFilters,
) => {
  return repo.findAll(filters);
};

/** E1: one page of the filtered list plus counts across the whole filtered set. */
export const getPage = async (filters: AttendanceFilters, request: PageRequest) => {
  const orderBy = orderByFor(request, repo.ATTENDANCE_SORT_COLUMNS, repo.defaultAttendanceOrder, attendance.id);
  const [{ items, meta }, summary] = await Promise.all([
    paginate(
      request,
      () => repo.countFiltered(filters),
      ({ limit, offset }) => repo.findPage(filters, limit, offset, orderBy),
    ),
    repo.summarize(filters),
  ]);
  return { items, meta: { ...meta, summary } };
};

const HEATMAP_DAYS = 14;

export const getHeatmap = async () => {
  const days = lastDays(HEATMAP_DAYS);
  return buildHeatmap(await repo.findSince(days[0]!), HEATMAP_DAYS);
};

export const bulkVerify = async (filters: AttendanceFilters) => repo.verifyCleanPending(filters);

/**
 * Get a single attendance record.
 */
export const getById = async (id: number) => {
  const record = await repo.findById(id);

  if (!record) {
    throw new NotFoundError(
      "Attendance record",
      String(id),
    );
  }

  return record;
};

/**
 * Create an attendance record.
 *
 * Additional fields:
 * - latitude
 * - longitude
 * - photoUrl
 * - projectCode
 */
export const create = async (
  input: CreateAttendanceInput & {
    projectCode: string;
    latitude?: number;
    longitude?: number;
    photoUrl?: string;
  },
  actor?: { role: string; userId: number },
) => {
  // ---------------------------------------------------------
  // E1: idempotent replay. A queued offline entry may be retried more than
  // once (the device isn't sure an earlier sync attempt landed before it
  // dropped offline again) — if this exact clientRequestId already produced
  // a row, return that row instead of re-running validation, which would
  // otherwise reject the replay as "already recorded today".
  // ---------------------------------------------------------

  if (input.clientRequestId) {
    const existing = await repo.findByClientRequestId(input.clientRequestId);
    if (existing) return existing;
  }

  // ---------------------------------------------------------
  // Prevent duplicate attendance for the same employee/day.
  // ---------------------------------------------------------

  const existingToday = await repo.findAll({
    employeeId: input.employeeId,
    dateFrom: input.logDate,
    dateTo: input.logDate,
  });

  if (existingToday.length > 0) {
    throw new ValidationError(
      "Attendance for this employee has already been recorded today",
    );
  }

  // ---------------------------------------------------------
  // Verification photo is required.
  // ---------------------------------------------------------

  if (!input.photoUrl) {
    throw new ValidationError(
      "A verification photo is required to record attendance",
    );
  }

  await assertProjectWritable(input.projectCode);

  // G1: a clock-in only counts against a project actually under
  // construction, and (for Site Personnel themselves) only for someone
  // actually staffed on it. Admin/IT Designer may still backfill/correct
  // records for any employee, so the staffing check is scoped to the
  // Site Personnel actor's own submission.
  const project = await db
    .select()
    .from(projects)
    .where(eq(projects.code, input.projectCode))
    .then((rows) => rows[0]);

  if (!project) {
    throw new NotFoundError("Project", input.projectCode);
  }

  if (!["Construction", "Closeout"].includes(project.status)) {
    throw new ConflictError(
      `Attendance can only be logged while the project is in Construction or Closeout (currently ${project.status})`,
    );
  }

  if (actor?.role === "site-personnel") {
    const employee = await employeesRepo.findByEmployeeId(input.employeeId);
    if (!employee?.userId) {
      throw new ForbiddenError(
        "No account is linked to this employee record",
      );
    }

    const staffed = await projectMemberRepo.findAll({
      projectCode: input.projectCode,
      userId: employee.userId,
      role: "site-personnel",
    });

    if (staffed.length === 0) {
      throw new ForbiddenError(
        `${employee.name} is not staffed on ${input.projectCode} as site personnel`,
      );
    }
  }

  // ---------------------------------------------------------
  // Geofencing
  // ---------------------------------------------------------

  // "Unverified", not "Outside", is the starting point: a clock-in with no
  // project code, or against a project whose site coordinates were never
  // recorded, has not been measured at all. Defaulting it to "Outside"
  // reported a boundary violation that was never evaluated, flagged the
  // record, and gave HR a red badge with nothing behind it to check.
  let geofence = "Unverified";

  let distanceFromSiteM:
    | number
    | undefined;

  if (
    input.projectCode &&
    input.latitude != null &&
    input.longitude != null
  ) {
    const [project] = await db
      .select()
      .from(projects)
      .where(
        eq(
          projects.code,
          input.projectCode,
        ),
      );

    if (
      project?.siteLatitude != null &&
      project?.siteLongitude != null
    ) {
      distanceFromSiteM = Math.round(
        distanceMeters(
          input.latitude,
          input.longitude,
          Number(project.siteLatitude),
          Number(project.siteLongitude),
        ),
      );

      const radius =
        project.geofenceRadiusM ?? 300;

      geofence =
        distanceFromSiteM <= radius
          ? "Inside"
          : "Outside";
    }
  }

  // ---------------------------------------------------------
  // Calculate attendance hours.
  // ---------------------------------------------------------

  const hours = computeHours(
    input.clockIn,
    input.clockOut,
  );

  // ---------------------------------------------------------
  // Create attendance record.
  // ---------------------------------------------------------

  return repo.create({
    ...input,
    geofence,
    distanceFromSiteM,
    photo: "Verified",
    // Only a measured breach is a flag. An unmeasured clock-in is Pending:
    // it needs a human to confirm the photo and coordinates, which is a
    // different thing from a confirmed geofence violation.
    status:
      geofence === "Inside"
        ? "Verified"
        : geofence === "Outside"
        ? "Flagged"
        : "Pending",
    attendanceStatus:
      input.attendanceStatus ?? "Present",
    hours,
  } as Parameters<typeof repo.create>[0]);
};

/**
 * HR confirms an absence (fix 2.3), usually from the daily exceptions list.
 * Goes through the same checks as any attendance write: the employee and
 * project must exist, the project must be open for changes, and the person must
 * not already have a record that day. The record is written only because a
 * person asked for it; the daily check itself never creates one.
 */
export const markAbsent = async (
  input: { employeeId: string; projectCode: string; logDate: string; remarks?: string },
  actor: { name: string },
) => {
  const employee = await employeesRepo.findByEmployeeId(input.employeeId);
  if (!employee) throw new NotFoundError("Employee", input.employeeId);
  if (employee.status !== "Active") {
    throw new ValidationError(`${employee.name} is ${employee.status}, not Active, so an absence cannot be recorded`);
  }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  if (input.logDate > today) throw new ValidationError("An absence cannot be recorded for a future date");

  const project = await db.select().from(projects).where(eq(projects.code, input.projectCode)).then((rows) => rows[0]);
  if (!project) throw new NotFoundError("Project", input.projectCode);
  await assertProjectWritable(input.projectCode);

  const existing = await repo.findAll({ employeeId: input.employeeId, dateFrom: input.logDate, dateTo: input.logDate });
  if (existing.length > 0) {
    throw new ConflictError(`${employee.name} already has an attendance record for ${input.logDate}`);
  }

  return repo.create({
    employeeId: input.employeeId,
    site: project.name,
    projectCode: input.projectCode,
    clockIn: "00:00",
    logDate: input.logDate,
    attendanceStatus: "Absent",
    // No photo or coordinates stand behind an absence; HR confirming it is the verification.
    geofence: "Unverified",
    photo: "Not captured",
    status: "Verified",
    source: "HR",
    remarks: [`Marked absent by ${actor.name}`, input.remarks].filter(Boolean).join(": "),
  } as Parameters<typeof repo.create>[0]);
};

/**
 * Ownership + field scoping for Site Personnel.
 *
 * A worker may PATCH attendance only to close out their own still-open
 * record for that day. Everything else on this endpoint (editing hours,
 * flipping attendance status, back-dating) stays with HR/PM/Admin — the
 * route-level guard lets Site Personnel in, this decides what they may do
 * once inside.
 */
const SITE_PERSONNEL_UPDATABLE_FIELDS = new Set(["clockOut"]);

export const assertCanUpdateAttendance = async (
  record: { employeeId: string; clockOut: string | null },
  input: UpdateAttendanceInput,
  actor: { role: string; employeeId: string | null },
) => {
  if (actor.role !== "site-personnel") return;

  if (!actor.employeeId || record.employeeId !== actor.employeeId) {
    throw new ForbiddenError(
      "You can only update your own attendance record",
    );
  }

  const attemptedFields = Object.keys(input).filter(
    (key) => input[key as keyof UpdateAttendanceInput] !== undefined,
  );

  const disallowed = attemptedFields.filter(
    (field) => !SITE_PERSONNEL_UPDATABLE_FIELDS.has(field),
  );

  if (disallowed.length > 0) {
    throw new ForbiddenError(
      `You can only clock out; ask HR to change ${disallowed.join(", ")}`,
    );
  }

  if (record.clockOut) {
    throw new ValidationError(
      "You have already clocked out of this record",
    );
  }
};

/**
 * Update an attendance record.
 */
export const update = async (
  id: number,
  input: UpdateAttendanceInput,
) => {
  const existing = await getById(id);

  const clockIn =
    input.clockIn ??
    existing.clockIn;

  const clockOut =
    input.clockOut ??
    existing.clockOut ??
    undefined;

  const updated = await repo.update(id, {
    ...input,
    hours: computeHours(
      clockIn,
      clockOut,
    ),
  });

  if (!updated) {
    throw new NotFoundError(
      "Attendance record",
      String(id),
    );
  }

  return updated;
};

/**
 * Delete an attendance record.
 */
export const remove = async (
  id: number,
) => {
  // Make sure the record exists first.
  await getById(id);

  const deleted = await repo.remove(id);

  if (!deleted) {
    throw new NotFoundError(
      "Attendance record",
      String(id),
    );
  }

  return deleted;
};