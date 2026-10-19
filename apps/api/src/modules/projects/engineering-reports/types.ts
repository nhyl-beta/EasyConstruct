export const ENGINEERING_REPORT_TYPES = [
  "Site Inspection",
  "Structural Assessment",
  "Technical Report",
  "Safety Observation",
  "Quality Inspection",
  "Progress Report",
  "Engineering Recommendation",
  "Non-Conformance Report",
  // H1: gate X1 (Closeout exit) requires an Approved report of this exact
  // type — see lifecycle/gates.ts x1.
  "Final Inspection",
] as const;

export const REPORT_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;

export const REPORT_STATUSES = [
  "Draft",
  "Submitted",
  "Under Review",
  "Approved",
  "Rejected",
  "Revision Required",
] as const;

export interface EngineeringReportRecord {
  id: number;
  reportId: string;
  title: string;
  type: string;
  project: string;
  location: string;
  date: string;
  engineer: string;
  priority: string;
  description: string;
  findings: string;
  measurements: string | null;
  observations: string | null;
  recommendations: string;
  requiredActions: string | null;
  status: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateEngineeringReportInput {
  reportId?: string;
  title: string;
  type: string;
  project: string;
  location: string;
  date: string;
  engineer: string;
  priority?: string;
  description: string;
  findings: string;
  measurements?: string;
  observations?: string;
  recommendations: string;
  requiredActions?: string;
  status?: string;
}

export interface UpdateEngineeringReportInput extends Partial<CreateEngineeringReportInput> {}

export interface EngineeringReportFilters {
  /** Restrict to these project codes (visibility scope; set by the controller). */
  codes?: string[];
  project?: string;
  type?: string;
  status?: string;
  search?: string;
}