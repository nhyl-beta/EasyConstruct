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

export type RoleLabel = (typeof ROLES)[number]["label"];
export const roleByLabel = (label: string): RoleDef => {
  const r = ROLES.find((x) => x.label.toLowerCase() === label.trim().toLowerCase());
  if (!r) throw new Error(`Unknown role "${label}"`);
  return r;
};
