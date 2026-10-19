import type { LucideIcon } from "lucide-react";

/** Frontend role keys (see config/role-mapping.ts). */
export const ROLES = [
  "admin",
  "owner",
  "it_designer",
  "project_manager",
  "human_resources",
  "finance_manager",
  "architect",
  "engineer",
  "site_personnel",
  "consultant",
] as const;
export type Role = (typeof ROLES)[number];

export const isRole = (value: string): value is Role => (ROLES as readonly string[]).includes(value);

export interface QuickEntry {
  id: string;
  kind: "action" | "page";
  label: string;
  description?: string;
  /** Synonyms and aliases matched in addition to the label. */
  keywords: string[];
  icon: LucideIcon;
  route: string;
  roles: Role[];
  /**
   * The ROLE_RESOURCE_ACCESS resource this entry sits under. Every role in
   * `roles` must list it; the role-matrix test enforces that.
   */
  resource?: string;
  /** True when the destination opens something that creates or changes data. */
  changesData?: boolean;
}

export type RecordKind =
  | "project"
  | "proposal"
  | "workflow"
  | "approval"
  | "design"
  | "document"
  | "person"
  | "task"
  | "issue"
  | "requirement"
  | "report"
  | "budget"
  | "expense"
  | "request"
  | "blueprint";

export interface RecordResult {
  /** Unique within its kind. */
  id: string;
  kind: RecordKind;
  title: string;
  subtitle?: string;
  route: string;
  keywords: string[];
}

export interface RecordSourceState {
  results: RecordResult[];
  loading: boolean;
  error: string | null;
}

export interface RecordSource {
  kind: RecordKind;
  /** Group heading in the palette ("Projects"). */
  label: string;
  roles: Role[];
  /**
   * A React hook. It is only ever called from a component that is mounted
   * after the palette is first opened, so nothing loads before that.
   */
  useItems: () => RecordSourceState;
}

/** What the ranker needs from anything it orders. */
export interface Rankable {
  label: string;
  keywords: readonly string[];
  kind: "action" | "page" | "record";
}
