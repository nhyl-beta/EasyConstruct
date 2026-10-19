// apps/api/src/milestones/types.ts — NEW
import type { MilestoneLinkType, MilestoneStatus } from "../core/db/schema/milestones.js";

export type { MilestoneLinkType, MilestoneStatus };

export interface MilestoneRecord {
  id: number;
  projectCode: string;
  title: string;
  description: string | null;
  status: string;
  estimatedCompletionDate: string | null;
  createdBy: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateMilestoneInput {
  projectCode: string;
  title: string;
  description?: string;
  // Creation is always a draft — see milestones/service.ts. Not accepted
  // here so a client can't skip straight to a later status.
  estimatedCompletionDate?: string;
}

export interface UpdateMilestoneInput {
  title?: string;
  description?: string;
  status?: MilestoneStatus;
  estimatedCompletionDate?: string;
}

export interface MilestoneFilters {
  projectCode?: string;
}

export interface MilestoneLinkRecord {
  id: number;
  milestoneId: number;
  linkType: MilestoneLinkType;
  linkId: number;
  createdAt: Date | null;
  /** Populated for linkType='task' — the only kind anything resolves against yet. */
  task?: {
    id: number;
    title: string;
    status: string;
    assignedToUserId: number | null;
    assignedToName: string | null;
  } | null;
}

export interface CreateMilestoneLinkInput {
  linkType: MilestoneLinkType;
  linkId: number;
}
