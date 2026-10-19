// apps/api/src/validators/attendance-validators.ts — PATCHED (add coordinates/photo/projectCode)
import { z } from "zod";

export const attendanceStatusEnum = z.enum([
  "Present",
  "Absent",
  "Late",
  "On Leave",
  "Half Day",
]);

export const createAttendanceSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  site: z.string().min(1, "Site is required"),
  projectCode: z.string().min(1, "Project is required").max(50),
  clockIn: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  clockOut: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM").optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  photoUrl: z.string().max(500).optional(),
  attendanceStatus: attendanceStatusEnum.optional(),
  remarks: z.string().max(500).optional(),
  logDate: z.string().min(1, "Date is required"),
  // E1: offline queue support — see db/schema/attendance.ts. Without these
  // declared here, the validator silently stripped them from every request
  // body (zod's default z.object() behavior), so an offline-synced entry's
  // idempotency key never reached the database at all.
  clientRequestId: z.string().max(64).optional(),
  validatedOffline: z.boolean().optional(),
});

// HR confirms a likely absence from the daily check (fix 2.3).
export const markAbsentSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  projectCode: z.string().min(1, "Project is required").max(50),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  remarks: z.string().max(300).optional(),
});

// `status` is the HR verification outcome (Verified | Flagged | Pending), as
// opposed to `attendanceStatus` (Present | Absent | …). It is deliberately
// absent from the create schema — clock-in derives it from the geofence
// result — but HR has to be able to set it once it has checked the clock-in
// photo and coordinates, and there was no way to write it at all.
export const updateAttendanceSchema = createAttendanceSchema.partial().extend({
  status: z.enum(["Verified", "Flagged", "Pending"]).optional(),
});