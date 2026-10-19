// apps/api/src/project-stakeholders/rules.ts: pure, no I/O (client demo change #4)
//
// Stakeholder roles, who may see contact details, how the first Owner keeps projects.client in step, and the
// plan for the Owner backfill. Nothing here touches the database.
import { ValidationError } from "../utils/errors.js";

export const STAKEHOLDER_ROLES = ["Owner", "Contractor", "Other"] as const;
export type StakeholderRole = (typeof STAKEHOLDER_ROLES)[number];

export const isStakeholderRole = (value: unknown): value is StakeholderRole =>
  typeof value === "string" && (STAKEHOLDER_ROLES as readonly string[]).includes(value);

export const assertStakeholderRole = (value: unknown): StakeholderRole => {
  if (!isStakeholderRole(value)) throw new ValidationError(`Role must be one of: ${STAKEHOLDER_ROLES.join(", ")}`);
  return value;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isValidEmail = (value: string): boolean => value.length <= 255 && EMAIL.test(value.trim());
export const normalizeEmail = (value: string): string => value.trim().toLowerCase();

export interface StakeholderRow {
  id: number;
  projectCode: string;
  name: string;
  company: string | null;
  role: string;
  email: string | null;
  phone: string | null;
  createdBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Only the Admin and the project's PM see emails and phones. Everyone else who can see the project sees names and companies. */
export const canSeeContactDetails = (role: string): boolean => role === "admin" || role === "project-manager";

export type VisibleStakeholder = Omit<StakeholderRow, "email" | "phone"> & { email: string | null; phone: string | null; hasEmail: boolean; contactHidden: boolean };

export const forViewer = (row: StakeholderRow, viewerRole: string): VisibleStakeholder => {
  const see = canSeeContactDetails(viewerRole);
  return { ...row, email: see ? row.email : null, phone: see ? row.phone : null, hasEmail: !!row.email, contactHidden: !see };
};

/** The row the older screens read: the first Owner (lowest id). */
export const primaryOwner = <T extends Pick<StakeholderRow, "id" | "role">>(rows: readonly T[]): T | undefined =>
  [...rows].filter((r) => r.role === "Owner").sort((a, b) => a.id - b.id)[0];

/** What projects.client and projects.client_email should hold for a given first Owner. */
export const projectFieldsFromOwner = (owner: Pick<StakeholderRow, "name" | "company" | "email">): { client: string; clientEmail: string | null } => ({
  client: (owner.company?.trim() || owner.name).trim(),
  clientEmail: owner.email?.trim() ? normalizeEmail(owner.email) : null,
});

export interface BackfillProject {
  code: string;
  client: string | null;
  clientEmail: string | null;
}

export interface BackfillInsert {
  projectCode: string;
  name: string;
  company: string | null;
  role: "Owner";
  email: string | null;
  createdBy: string;
}

/**
 * One Owner row for each project that has a client name or email and no Owner row yet. Running it again
 * after applying finds nothing to do, so the backfill is idempotent.
 */
export const planBackfill = (projects: readonly BackfillProject[], projectCodesWithOwner: ReadonlySet<string>): BackfillInsert[] => {
  const out: BackfillInsert[] = [];
  for (const p of projects) {
    if (projectCodesWithOwner.has(p.code)) continue;
    const client = p.client?.trim() || "";
    const email = p.clientEmail?.trim() || "";
    if (!client && !email) continue;
    out.push({
      projectCode: p.code,
      name: client || email,
      company: client || null,
      role: "Owner",
      email: email ? normalizeEmail(email) : null,
      createdBy: "backfill",
    });
  }
  return out;
};
