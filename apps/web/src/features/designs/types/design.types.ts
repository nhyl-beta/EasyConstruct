/** One engineer assigned to a design (design_engineers row, flattened). */
export interface DesignAssignedEngineer {
  userId: number;
  userName: string;
}

export interface Design {
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
  /** Files the architect attached when submitting the design. */
  fileUrls?: Array<{ name: string; url: string }>;
  // Denormalized first engineer, kept in sync with assignedEngineers[0] by
  // the API; prefer assignedEngineers.
  assignedEngineerId: number | null;
  assignedEngineerName: string | null;
  assignedEngineers: DesignAssignedEngineer[];
  aiCompleteness: number;
  aiConfidence: number;
  createdAt: string | null;
  updatedAt: string | null;
}