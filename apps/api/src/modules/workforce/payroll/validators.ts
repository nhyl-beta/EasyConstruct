import { z } from "zod";

// `.strict()` everywhere: a request carrying a gross, deduction, net or
// statutory field is rejected outright rather than silently ignored — payroll
// money is computed on the server only.
export const payrollEntrySchema = z
  .object({
    employeeId: z.string().min(1),
    hoursWorked: z.number().min(0),
    overtimeHours: z.number().min(0).optional(),
    adjustments: z.number().optional(),
  })
  .strict();

export const generatePayrollSchema = z
  .object({
    period: z.string().min(1, "Payroll period is required"),
    group: z.string().optional(),
    projectCode: z.string().optional(),
    entries: z.array(payrollEntrySchema).min(1, "At least one employee entry is required"),
    submit: z.boolean().optional(),
    confirmDuplicate: z.boolean().optional(),
    acknowledgedWarnings: z.array(z.string().max(80)).max(500).optional(),
  })
  .strict();

// Only inputs; the server recomputes gross, every deduction and net.
export const updatePayrollLineSchema = z
  .object({
    hours: z.number().min(0).optional(),
    overtime: z.number().min(0).optional(),
    adjustments: z.number().optional(),
  })
  .strict();

export const submitBatchSchema = z
  .object({ confirmDuplicate: z.boolean().optional(), acknowledgedWarnings: z.array(z.string().max(80)).max(500).optional() })
  .strict();
