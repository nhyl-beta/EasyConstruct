export const ROLE_IDS = [
  "admin",
  "owner",
  "it-designer",
  "project-manager",
  "human-resources",
  "finance-manager",
  "architect",
  "engineer",
  "site-personnel",
  "consultant",
] as const;

export type ROLE_IDS = (typeof ROLE_IDS)[number];
export type RoleId = ROLE_IDS;
