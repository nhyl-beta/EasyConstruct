// apps/api/src/document-types/rules.ts: pure, no I/O (client demo change #1)
//
// Naming, duplicate and protection rules for editable document types, plus the seed list.
// The lifecycle gates (lifecycle/gates.ts, lifecycle/service.ts, plan-suggestion) read
// some of these by exact name, so those are `isSystem`: they cannot be renamed or
// deactivated. Nothing else in the codebase may depend on a type name.
import { AppError, ValidationError } from "../../utils/errors.js";

export const LEGAL_CATEGORY = "Legal";
export const REPORTS_CATEGORY = "Reports";
export const MAX_TYPE_NAME = 50;

/** Lowercase, accents and punctuation removed, spaces collapsed. "As-Built  Drawing" and "as built drawing" are one type. */
export const normalizeTypeName = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The name as it is stored: trimmed, inner spaces collapsed, original capitalisation kept. */
export const cleanTypeName = (name: string): string => name.trim().replace(/\s+/g, " ");

export const cleanCategory = (category: string | undefined | null): string => cleanTypeName(category ?? "") || "General";

export interface DocumentTypeSeed {
  name: string;
  category: string;
  isSystem: boolean;
}

export const DOCUMENT_TYPE_SEEDS: readonly DocumentTypeSeed[] = [
  { name: "Field Report", category: "Field", isSystem: false },
  { name: "Site Photo", category: "Field", isSystem: false },
  { name: "Progress Evidence", category: "Field", isSystem: false },
  { name: "Supporting Document", category: "Field", isSystem: false },
  { name: "Notice of Award", category: "Project", isSystem: true },
  { name: "Contract", category: "Project", isSystem: true },
  { name: "Notice to Proceed", category: "Project", isSystem: true },
  { name: "Certificate of Completion", category: "Project", isSystem: true },
  { name: "Turnover Document", category: "Project", isSystem: true },
  { name: "Client Acceptance", category: "Project", isSystem: true },
  { name: "As-Built Drawing", category: "Project", isSystem: true },
  { name: "Permit", category: LEGAL_CATEGORY, isSystem: false },
  { name: "NDA", category: LEGAL_CATEGORY, isSystem: false },
  { name: "Clearance", category: LEGAL_CATEGORY, isSystem: false },
  { name: "Bond", category: LEGAL_CATEGORY, isSystem: false },
  { name: "Insurance", category: LEGAL_CATEGORY, isSystem: false },
  // PM reports (change #10). System types: the missing-report check reads them by name.
  { name: "Daily Report", category: REPORTS_CATEGORY, isSystem: true },
  { name: "Weekly Report", category: REPORTS_CATEGORY, isSystem: true },
  { name: "Monthly Report", category: REPORTS_CATEGORY, isSystem: true },
];

export const SYSTEM_TYPE_NAMES: readonly string[] = DOCUMENT_TYPE_SEEDS.filter((s) => s.isSystem).map((s) => s.name);

export interface TypeLike {
  id: number;
  name: string;
  nameKey: string;
  category?: string;
  isSystem: boolean;
  active: boolean;
}

/** Throws a 400 for an empty or over-long name; returns the stored form and key. */
export const prepareTypeName = (raw: string): { name: string; nameKey: string } => {
  const name = cleanTypeName(raw);
  const nameKey = normalizeTypeName(name);
  if (!nameKey) throw new ValidationError("Enter a document type name");
  if (name.length > MAX_TYPE_NAME) throw new ValidationError(`A document type name can be at most ${MAX_TYPE_NAME} characters`);
  return { name, nameKey };
};

/** A name that another type already uses (case, spacing and punctuation ignored). `exceptId` skips the type being edited. */
export const findDuplicate = <T extends Pick<TypeLike, "id" | "nameKey">>(nameKey: string, existing: readonly T[], exceptId?: number): T | undefined =>
  existing.find((t) => t.nameKey === nameKey && t.id !== exceptId);

export const duplicateError = (name: string) =>
  new AppError(409, "DUPLICATE_NAME", `"${name}" is already a document type. Use it instead of adding it again.`);

/** Refuses to rename or deactivate a system type. Changing its category is allowed. */
export const assertEditAllowed = (current: Pick<TypeLike, "name" | "isSystem" | "nameKey">, change: { name?: string; active?: boolean }) => {
  if (!current.isSystem) return;
  if (change.name !== undefined && normalizeTypeName(change.name) !== current.nameKey) {
    throw new AppError(409, "SYSTEM_TYPE", `"${current.name}" is a system type (project gates read it by name), so it cannot be renamed.`);
  }
  if (change.active === false) {
    throw new AppError(409, "SYSTEM_TYPE", `"${current.name}" is a system type (project gates read it by name), so it cannot be deactivated.`);
  }
};

export type TypeCheck = { ok: true; name: string } | { ok: false; reason: "unknown" | "inactive"; message: string };

/**
 * Is a submitted type name acceptable for a NEW document? It must match an active type (case and spacing
 * ignored). The canonical stored name is returned so the lifecycle's exact-name reads keep matching.
 */
export const checkSubmittedType = (submitted: string, types: readonly Pick<TypeLike, "name" | "nameKey" | "active">[]): TypeCheck => {
  const key = normalizeTypeName(submitted);
  const hit = key ? types.find((t) => t.nameKey === key) : undefined;
  if (!hit) return { ok: false, reason: "unknown", message: `"${submitted.trim()}" is not a document type. Pick one from the list, or ask an Admin to add it.` };
  if (!hit.active) return { ok: false, reason: "inactive", message: `"${hit.name}" is no longer in use as a document type. Pick another.` };
  return { ok: true, name: hit.name };
};
