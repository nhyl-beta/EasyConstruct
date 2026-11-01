// The 10 roles in the spec (file 01/03) mapped to the seeded QA accounts. Test-only credentials.
// Emails come from apps/api/scripts/demo/seed-demo-accounts.ts (named account per role); the Owner's
// address is overridden at seed time (DEMO_OWNER_EMAIL) so the real owner mailbox is never used.
export const QA_PASSWORD = "Demo@12345";
export const QA_OWNER_EMAIL = "qa-owner@easyconstruct.demo";

export interface RoleDef { label: string; slug: string; backend: string; email: string; code: string }

export const ROLES: RoleDef[] = [
  { label: "Owner", slug: "owner", backend: "owner", email: QA_OWNER_EMAIL, code: "OWN" },
  { label: "Admin", slug: "admin", backend: "admin", email: "admin@easyconstruct.demo", code: "ADM" },
  { label: "IT Designer", slug: "it-designer", backend: "it-designer", email: "itdesigner@easyconstruct.demo", code: "ITD" },
  { label: "Project Manager", slug: "project-manager", backend: "project-manager", email: "pm@easyconstruct.demo", code: "PM" },
  { label: "Human Resources", slug: "human-resources", backend: "human-resources", email: "hr@easyconstruct.demo", code: "HR" },
  { label: "Finance Manager", slug: "finance-manager", backend: "finance-manager", email: "finance@easyconstruct.demo", code: "FIN" },
  { label: "Architect", slug: "architect", backend: "architect", email: "architect@easyconstruct.demo", code: "ARC" },
  { label: "Engineer", slug: "engineer", backend: "engineer", email: "engineer@easyconstruct.demo", code: "ENG" },
  { label: "Site Personnel", slug: "site-personnel", backend: "site-personnel", email: "site@easyconstruct.demo", code: "SIT" },
  { label: "Consultant", slug: "consultant", backend: "consultant", email: "consultant@easyconstruct.demo", code: "CON" },
];

/** Extra seeded accounts used by lifecycle tests (not one of the 10 spec roles). */
export const EXTRA_ACCOUNTS: RoleDef[] = [
  { label: "Project Manager (other)", slug: "project-manager-2", backend: "project-manager", email: "projectmanager1@easyconstruct.demo", code: "PM2" },
  { label: "Engineer (other)", slug: "engineer-2", backend: "engineer", email: "engineer1@easyconstruct.demo", code: "EN2" },
  { label: "Site Personnel (other)", slug: "site-personnel-2", backend: "site-personnel", email: "sitepersonnel1@easyconstruct.demo", code: "SI2" },
];

export type RoleLabel = (typeof ROLES)[number]["label"];
export const roleByLabel = (label: string): RoleDef => {
  const r = [...ROLES, ...EXTRA_ACCOUNTS].find((x) => x.label.toLowerCase() === label.trim().toLowerCase());
  if (!r) throw new Error(`Unknown role "${label}"`);
  return r;
};

/** Id of a file-01 cell (page row number x role). */
export const mxId = (roleCode: string, rowNo: number) => `MX-${roleCode}-${String(rowNo).padStart(2, "0")}`;
