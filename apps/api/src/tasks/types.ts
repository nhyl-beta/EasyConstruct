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
  assignedToUserId: number | null;
  assignedToName: string | null;
  completionNote: string | null;
  completionFileUrl: string | null;
  completedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateTaskInput {
  taskCode: string;
  projectCode: string;
  title: string;
  description?: string;
  priority?: string;
  status?: string;
  progress?: number;
  dueDate?: string;
  assignedToUserId?: number;
  assignedToName?: string;
  /** Link the new task to this milestone in the same request (create only). */
  milestoneId?: number;
}

export interface UpdateTaskStatusInput {
  status: string;
  completionNote?: string;
  completionFileUrl?: string;
}

export interface UpdateTaskInput extends Partial<CreateTaskInput> {}

export interface TaskFilters {
  /** Restrict to these project codes (visibility scope; set by the controller). */
  codes?: string[];
  projectCode?: string;
  status?: string;
  assignedToUserId?: number;
}