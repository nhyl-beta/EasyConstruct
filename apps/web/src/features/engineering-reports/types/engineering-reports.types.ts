export const ENGINEERING_REPORT_TYPES = [
  "Site Inspection",
  "Structural Assessment",
  "Technical Report",
  "Safety Observation",
  "Quality Inspection",
  "Progress Report",
  "Engineering Recommendation",
  "Non-Conformance Report",
  // H1: gate X1 (Closeout exit) requires an Approved report of this type.
  "Final Inspection",
] as const;

export type EngineeringReportType = (typeof ENGINEERING_REPORT_TYPES)[number];

export const REPORT_PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
export type ReportPriority = (typeof REPORT_PRIORITIES)[number];

export const REPORT_STATUSES = [
  "Draft",
  "Submitted",
  "Under Review",
  "Approved",
  "Rejected",
  "Revision Required",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

// Reports that answer "where do things stand" — surfaced on the Progress page.
export const PROGRESS_REPORT_TYPES: EngineeringReportType[] = [
  "Progress Report",
  "Site Inspection",
  "Structural Assessment",
  "Quality Inspection",
  "Technical Report",
  "Final Inspection",
];

// Reports that flag a problem needing action — surfaced on the Issues page.
export const ISSUE_REPORT_TYPES: EngineeringReportType[] = [
  "Safety Observation",
  "Non-Conformance Report",
  "Engineering Recommendation",
];

export interface EngineeringReport {
  id: string; // human-readable report code, e.g. "SR-2218"
  dbId: number; // numeric primary key — PATCH /engineering-reports/:id needs this, not the code
  title: string;
  type: EngineeringReportType;
  project: string;
  location: string;
  date: string;
  engineer: string;
  priority: ReportPriority;
  description: string;
  findings: string;
  measurements?: string;
  observations?: string;
  recommendations: string;
  requiredActions?: string;
  status: ReportStatus;
  updatedAgo: string;
}

export interface EngineeringReportFilters {
  project?: string;
  type?: string;
  status?: string;
  search?: string;
}

export interface CreateEngineeringReportInput {
  title: string;
  type: EngineeringReportType;
  project: string;
  location: string;
  date: string;
  engineer: string;
  priority: ReportPriority;
  description: string;
  findings: string;
  measurements?: string;
  observations?: string;
  recommendations: string;
  requiredActions?: string;
}