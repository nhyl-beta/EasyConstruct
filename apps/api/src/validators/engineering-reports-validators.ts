import { z } from "zod";
import {
  ENGINEERING_REPORT_TYPES,
  REPORT_PRIORITIES,
  REPORT_STATUSES,
} from "../engineering-reports/types.js";

export const createEngineeringReportSchema = z.object({
  reportId: z.string().min(2).max(20).optional(),
  title: z.string().min(4, "Report title is required"),
  type: z.enum(ENGINEERING_REPORT_TYPES),
  project: z.string().min(2, "Select a project"),
  location: z.string().min(2, "Location is required"),
  date: z.string().min(4, "Report date is required"),
  engineer: z.string().min(2, "Engineer is required"),
  priority: z.enum(REPORT_PRIORITIES).optional(),
  description: z.string().min(10, "Description must be at least 10 characters"),
  findings: z.string().min(10, "Findings must be at least 10 characters"),
  measurements: z.string().optional(),
  observations: z.string().optional(),
  recommendations: z.string().min(5, "Recommendations are required"),
  requiredActions: z.string().optional(),
  status: z.enum(REPORT_STATUSES).optional(),
});

export const updateEngineeringReportSchema = createEngineeringReportSchema.partial();

export type CreateEngineeringReportInput = z.infer<typeof createEngineeringReportSchema>;
export type UpdateEngineeringReportInput = z.infer<typeof updateEngineeringReportSchema>;