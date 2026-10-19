/** One engineer assigned to a design (design_engineers row, flattened). */
export interface AssignedEngineer {
  userId: number;
  userName: string;
}

export interface DesignRecord {
  id: number;
  code: string;
  name: string;
  projectCode: string;
  discipline: string;
  category: string;
  phase: string;
  version: string;
  revision: number;
  status: string;
  leadArchitect: string;
  client: string | null;
  building: string | null;
  floor: string | null;
  zone: string | null;
  description: string | null;
  fileCount: number;
  fileUrls: Array<{ name: string; url: string }>;
  // Denormalized first engineer, kept in sync with assignedEngineers[0].
  assignedEngineerId: number | null;
  assignedEngineerName: string | null;
  assignedEngineers: AssignedEngineer[];
  aiCompleteness: number;
  aiConfidence: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateDesignInput {
  code: string;
  name: string;
  projectCode: string;
  discipline: string;
  category: string;
  phase?: string;
  version?: string;
  revision?: number;
  status?: string;
  leadArchitect: string;
  client?: string;
  building?: string;
  floor?: string;
  zone?: string;
  description?: string;
  fileCount?: number;
  fileUrls?: Array<{ name: string; url: string }>;
  // Derived from assignedEngineers on write — callers send the list, not these.
  assignedEngineerId?: number | null;
  assignedEngineerName?: string | null;
  assignedEngineers?: AssignedEngineer[];
  aiCompleteness?: number;
  aiConfidence?: number;
}

export interface UpdateDesignInput extends Partial<CreateDesignInput> {}

export interface DesignFilters {
  /** Restrict to these project codes (assigned-project scope; set by the controller). */
  codes?: string[];
  status?: string;
  discipline?: string;
  projectCode?: string;
  search?: string;
}