import type { ProjectMemberRole } from "../db/schema/project-members.js";

export type { ProjectMemberRole };

export interface ProjectMemberRecord {
  id: number;
  projectCode: string;
  userId: number;
  userName: string;
  role: ProjectMemberRole;
  addedBy: string;
  createdAt: Date | null;
}

export interface CreateProjectMemberInput {
  projectCode: string;
  userId: number;
  userName: string;
  role: ProjectMemberRole;
  addedBy: string;
}

export interface ProjectMemberFilters {
  projectCode?: string;
  userId?: number;
  role?: ProjectMemberRole;
}
