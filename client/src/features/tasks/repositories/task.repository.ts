// client/src/features/tasks/repositories/tasks.repository.ts — NEW
import { apiClient } from "@/services/api.client";

export interface TaskRecord {
  id: number;
  taskCode: string;
  projectCode: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  progress: number;
  dueDate: string | null;
  // The server has always returned these (server/src/tasks/types.ts) — this
  // type just never declared them, so nothing that reads a task could show
  // who it was assigned to or when it moved, which is exactly what an
  // Engineer/PM reviewing tasks they sent to Site Personnel needs to see.
  assignedToUserId: number | null;
  assignedToName: string | null;
  completionNote: string | null;
  completionFileUrl: string | null;
  completedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Evidence captured when a task moves to Completed. */
export interface TaskCompletionInput {
  completionNote?: string;
  completionFileUrl?: string;
}

export interface CreateTaskInput {
  taskCode: string;
  projectCode: string;
  title: string;
  description?: string;
  priority?: string;
  status?: string;
  dueDate?: string;
  assignedToUserId?: number;
  assignedToName?: string;
  /** Link to a milestone at creation; the server also enforces the due-date rule. */
  milestoneId?: number;
}

export type AssignmentWarningCode = "over_limit" | "overlap" | "absent_today" | "on_leave_today" | "inactive";

export interface AssignmentWarning {
  code: AssignmentWarningCode;
  message: string;
}

/** A task as returned by create/update: the record plus advisory warnings (fix 2.2). */
export type TaskWithWarnings = TaskRecord & { warnings?: AssignmentWarning[] };

export interface RankedAssignee {
  userId: number;
  name: string;
  employeeId: string | null;
  position: string | null;
  score: number;
  openTasks: number;
  reasons: string[];
}

export interface AssigneeSuggestions {
  projectCode: string;
  dueDate: string | null;
  suggestions: RankedAssignee[];
  excluded: { userId: number; name: string; reason: string }[];
  basis: string;
}

export interface AllocationProposal {
  projectCode: string;
  basis: string;
  items: {
    taskId: number;
    taskCode: string;
    title: string;
    dueDate: string | null;
    suggestions: RankedAssignee[];
  }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T>(promise: Promise<any>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

export const tasksRepository = {
  listMine: (): Promise<{ data: TaskRecord[] }> => apiClient.get("/tasks"),
  // Same endpoint as listMine — for non-site-personnel roles the backend's
  // Site-Personnel-only scoping doesn't apply, so this genuinely returns
  // every task. Named separately so reviewer-facing pages read clearly.
  list: (): Promise<{ data: TaskRecord[] }> => apiClient.get("/tasks"),
  // POST /tasks is role-gated to project-manager and engineer on the backend.
  create: (input: CreateTaskInput): Promise<{ data: TaskWithWarnings }> =>
    apiClient.post("/tasks", input),
  // PATCH /tasks/:id is project-manager + engineer; used to accept a suggested assignee.
  update: (id: number, input: Partial<CreateTaskInput>): Promise<{ data: TaskWithWarnings }> =>
    apiClient.patch(`/tasks/${id}`, input),
  // Decision support (read-only; nothing is saved by these calls).
  suggestAssignees: (params: { projectCode: string; title: string; dueDate?: string; milestoneId?: number }) => {
    const qs = new URLSearchParams({ projectCode: params.projectCode, title: params.title });
    if (params.dueDate) qs.set("dueDate", params.dueDate);
    if (params.milestoneId) qs.set("milestoneId", String(params.milestoneId));
    return unwrap<AssigneeSuggestions>(apiClient.get(`/tasks/suggest-assignees?${qs}`));
  },
  suggestAllocation: (projectCode: string) =>
    unwrap<AllocationProposal>(apiClient.post("/tasks/suggest-allocation", { projectCode })),
  assignmentWarnings: (params: { userId: number; dueDate?: string; excludeTaskId?: number }) => {
    const qs = new URLSearchParams({ userId: String(params.userId) });
    if (params.dueDate) qs.set("dueDate", params.dueDate);
    if (params.excludeTaskId) qs.set("excludeTaskId", String(params.excludeTaskId));
    return unwrap<AssignmentWarning[]>(apiClient.get(`/tasks/assignment-warnings?${qs}`));
  },
  // `completion` is only meaningful on the transition to Completed, where
  // the backend requires a note (see server/src/validators/task-validators.ts).
  updateStatus: (
    id: number,
    status: string,
    completion: TaskCompletionInput = {},
  ): Promise<{ data: TaskRecord }> =>
    apiClient.patch(`/tasks/${id}/status`, { status, ...completion }),
};