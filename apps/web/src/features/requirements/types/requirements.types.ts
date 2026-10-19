export const REQUIREMENT_CATEGORIES = [
  "Objectives",
  "Materials",
  "Constraints",
  "Specifications",
  "Other",
] as const;
export type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number];

export const REQUIREMENT_STATUSES = ["Draft", "Under Review", "Approved", "Rejected"] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

/** A file stored through POST /api/uploads and attached to a requirement. */
export interface RequirementAttachment {
  url: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface Requirement {
  id: string; // human-readable code, e.g. "REQ-101"
  /** Numeric primary key — what PATCH /requirements/:id actually takes. */
  dbId: number;
  title: string;
  project: string;
  category: RequirementCategory;
  description: string;
  status: RequirementStatus;
  attachments: RequirementAttachment[];
  createdBy: string;
  updatedAgo: string;
}

export interface RequirementFilters {
  project?: string;
  category?: string;
  status?: string;
  search?: string;
}

export interface CreateRequirementInput {
  title: string;
  project: string;
  category: RequirementCategory;
  description: string;
  /** At least one — enforced by the form and by the API. */
  attachments: RequirementAttachment[];
  createdBy: string;
}

export type StructuredSection = "objectives" | "materials" | "constraints" | "specifications";

export interface StructuredSuggestion {
  section: StructuredSection;
  text: string;
  reason: string;
}

export interface StructuredRewrite {
  from: string;
  to: string;
}

/** Output of POST /requirements/structure (rule-based, FEATURE_AI only). */
export interface StructuredRequirement {
  category: RequirementCategory;
  workType: string;
  sections: Record<StructuredSection, string[]>;
  suggestions: StructuredSuggestion[];
  rewrites: StructuredRewrite[];
  description: string;
}

/** Output of POST /requirements/generate-draft: the same shape plus what the draft was built from. */
export interface RequirementDraft extends StructuredRequirement {
  basis: string[];
}

export interface GenerateDraftInput {
  projectCode: string;
  category: string;
}

export interface StructureRequirementInput {
  text: string;
  title?: string;
  category?: string;
}
