import { z } from "zod";

export const employeeStatusEnum = z.enum([
  "Active",
  "On Leave",
  "Suspended",
  "Archived",
]);

export const createEmployeeSchema = z.object({
  employeeId: z.string().min(1, "Employee ID is required").max(20),
  name: z.string().min(1, "Name is required").max(255),
  role: z.string().min(1, "Role is required").max(100),
  department: z.string().min(1, "Department is required").max(100),
  site: z.string().min(1, "Site is required").max(255),
  status: employeeStatusEnum.optional(),
  hiredOn: z.string().min(1, "Hire date is required"),
  email: z.union([z.string().email("Invalid email"), z.literal("")]).optional(),
  phone: z.string().max(30).optional().or(z.literal("")),
  payRate: z.union([z.number(), z.string()]).optional(),
  rateType: z.enum(["Monthly", "Daily", "Hourly"]).optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();
