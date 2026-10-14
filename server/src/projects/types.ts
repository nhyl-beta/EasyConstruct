export interface ProjectRecord {
  id: number;
  name: string;
  code: string;
  pm: string;
  assignedEngineer: string | null;
  status: string;
  statusTone: string;
  progress: number;
  budget: number;
  contractValue: string | null;
  due: string;
  risk: string;
  location: string | null;
  client: string | null;
  currency: string;
  workforce: number | null;
  description: string | null;
  projectType: string | null;
  plannedStartDate: string | null;
  scopeSummary: string | null;
  deliveryType: string;
  designDisciplines: string[];
  siteLatitude: string | null;
  siteLongitude: string | null;
  geofenceRadiusM: number | null;
  previousStatus: string | null;
  holdReason: string | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  pmUserId: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateProjectInput {
  name: string;
  code: string;
  pm: string;
  assignedEngineer?: string;
  // Accepted, but projects/service.ts create() always overwrites these to
  // Proposal/neutral/0 — see project-validator.ts.
  status?: string;
  statusTone?: string;
  progress?: number;
  budget?: number;
  contractValue?: number | string | null;
  due: string;
  risk?: string;
  location?: string;
  client?: string;
  /** Link to the shared clients table (fix 1.2). The text above is set from it. */
  clientId?: number;
  /** Create anyway although a project with a similar name exists (fix 1.2). Never stored. */
  confirmSimilar?: boolean;
  currency?: string;
  workforce?: number;
  description?: string;
  projectType?: string;
  plannedStartDate?: string;
  scopeSummary?: string;
  /** "Construction" (default) or "Design" — fixed at creation. */
  deliveryType?: "Construction" | "Design";
  /** Plan-set disciplines chosen at creation for a Design project. */
  designDisciplines?: string[];
  siteLatitude?: number | string | null;
  siteLongitude?: number | string | null;
  geofenceRadiusM?: number | null;
}

// Deliberately NOT `Partial<CreateProjectInput>` — status/statusTone/progress
// are lifecycle-owned (see lifecycle/service.ts) and must not be reachable
// through the general project PATCH at all, not even optionally.
export type UpdateProjectInput = Partial<
  Omit<CreateProjectInput, "status" | "statusTone" | "progress" | "deliveryType" | "designDisciplines">
>;

export interface ProjectFilters {
  status?: string;
  risk?: string;
  projectType?: string;
  deliveryType?: string;
  /** Hide the terminal Archived phase (the default view of the list). */
  excludeArchived?: boolean;
  search?: string;
  /** Project Manager scope (set by the service, never read from the request). */
  pmUserId?: number;
  pmName?: string;
  /** Ask for headline status counts in the paged response's meta (see projects/service.ts getPage). */
  kpis?: "portfolio" | "filtered";
  /** Exact project code (resolves a human code to a row under pagination; additive to `search`). */
  code?: string;
  /** Restrict to these project codes (staffed roles' assigned projects; set by the service). */
  codes?: string[];
  page?: number;
  pageSize?: number;
}