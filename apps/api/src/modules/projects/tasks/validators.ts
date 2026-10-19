// apps/api/src/validators/task-validators.ts — NEW
import { z } from "zod";

export const createTaskSchema = z.object({
  taskCode: z.string().min(2).max(20),
  projectCode: z.string().min(1).max(50),
  title: z.string().min(2).max(255),
  description: z.string().max(2000).optional(),
  priority: z.enum(["Low", "Medium", "High"]).optional(),
  status: z.enum(["Pending", "In Progress", "Completed"]).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  dueDate: z.string().optional(),
  assignedToUserId: z.number().int().optional(),
  assignedToName: z.string().max(100).optional(),
  milestoneId: z.number().int().positive().optional(),
});

// milestoneId links at creation only; an existing task's milestone links are
// managed through /api/milestones/:id/links.
export const updateTaskSchema = createTaskSchema.omit({ milestoneId: true }).partial();

// Completing a task now carries evidence: a note describing what was done,
// and optionally a photo/document. The note is only mandatory on the
// transition to Completed — moving Pending → In Progress stays a bare flip.
export const updateTaskStatusSchema = z
  .object({
    status: z.enum(["Pending", "In Progress", "Completed"]),
    completionNote: z.string().max(2000).optional(),
    completionFileUrl: z.string().max(500).optional(),
  })
  .refine(
    (data) =>
      data.status !== "Completed" ||
      (data.completionNote?.trim().length ?? 0) > 0,
    {
      path: ["completionNote"],
      message: "Describe what was completed before marking the task done",
    },
  );

// ── Decision support (fixes 2.1, 2.2): read-only queries ──────────────────

export const suggestAssigneesQuerySchema = z.object({
  projectCode: z.string().min(1).max(50),
  title: z.string().min(1).max(255),
  dueDate: z.string().max(20).optional(),
  milestoneId: z.coerce.number().int().positive().optional(),
});

export const suggestAllocationSchema = z.object({
  projectCode: z.string().min(1).max(50),
});

export const assignmentWarningsQuerySchema = z.object({
  userId: z.coerce.number().int().positive(),
  dueDate: z.string().max(20).optional(),
  excludeTaskId: z.coerce.number().int().positive().optional(),
});
