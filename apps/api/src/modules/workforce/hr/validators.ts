import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");

export const createEmployeeSchema = z.object({
  employeeId: z.string().trim().min(2).max(20),
  name: z.string().trim().min(2).max(255),
  role: z.string().trim().min(2).max(100),
  department: z.string().trim().min(2).max(100),
  site: z.string().trim().min(1).max(255),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  status: z.enum(["Active", "On Leave", "Suspended", "Archived"]).optional(),
  hiredOn: dateString,
  payRate: z.coerce.number().min(0).max(100000000).optional(),
  rateType: z.enum(["Hourly", "Daily", "Monthly"]).optional(),
  attendanceRate: z.coerce.number().int().min(0).max(100).optional(),
  performance: z.coerce.number().min(0).max(5).optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export const attendanceSchema = z.object({
  employeeId: z.string().trim().min(2).max(20),
  site: z.string().trim().min(1).max(255),
  clockIn: timeString,
  clockOut: timeString.optional().nullable(),
  hours: z.coerce.number().min(0).max(24).optional().nullable(),
  geofence: z.enum(["Inside", "Edge", "Outside"]).optional(),
  photo: z.enum(["Verified", "Pending", "Failed"]).optional(),
  status: z.enum(["Verified", "Pending", "Flagged"]).optional(),
  logDate: dateString,
});

export const updateAttendanceSchema = attendanceSchema.partial();

export const attendanceQuerySchema = z.object({
  date: dateString.optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  employeeId: z.string().optional(),
  site: z.string().optional(),
  status: z.enum(["Verified", "Pending", "Flagged"]).optional(),
});

export const payrollQuerySchema = z.object({
  period: z.string().trim().max(50).optional(),
  periodStart: dateString.optional(),
  periodEnd: dateString.optional(),
});

export const workforceQuerySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type AttendanceInput = z.infer<typeof attendanceSchema>;
export type UpdateAttendanceInput = z.infer<typeof updateAttendanceSchema>;
export type AttendanceQuery = z.infer<typeof attendanceQuerySchema>;
export type PayrollQuery = z.infer<typeof payrollQuerySchema>;
