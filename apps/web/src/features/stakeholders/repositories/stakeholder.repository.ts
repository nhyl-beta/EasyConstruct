// Project stakeholders (client demo change #4): the people outside the company a project deals with.
import { apiClient } from "@/services/api.client";

export const STAKEHOLDER_ROLES = ["Owner", "Contractor", "Other"] as const;
export type StakeholderRole = (typeof STAKEHOLDER_ROLES)[number];

export interface Stakeholder {
  id: number;
  projectCode: string;
  name: string;
  company: string | null;
  role: StakeholderRole;
  /** Null for roles that may not see contact details (everyone but the PM and Admin). */
  email: string | null;
  phone: string | null;
  hasEmail: boolean;
  contactHidden: boolean;
}

export interface StakeholderInput {
  name: string;
  company?: string;
  role: StakeholderRole;
  email?: string;
  phone?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T>(promise: Promise<any>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

export const stakeholderRepository = {
  list: (projectCode: string) => unwrap<Stakeholder[]>(apiClient.get(`/stakeholders?projectCode=${encodeURIComponent(projectCode)}`)),
  create: (projectCode: string, input: StakeholderInput) => unwrap<Stakeholder>(apiClient.post("/stakeholders", { projectCode, ...input })),
  update: (id: number, input: Partial<StakeholderInput>) => unwrap<Stakeholder>(apiClient.patch(`/stakeholders/${id}`, input)),
  remove: (id: number) => unwrap<{ id: number }>(apiClient.del(`/stakeholders/${id}`)),
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isValidEmail = (value: string) => EMAIL.test(value.trim());

/** Field errors for one stakeholder form; an empty object means it can be saved. */
export function validateStakeholder(input: StakeholderInput): Partial<Record<keyof StakeholderInput, string>> {
  const errors: Partial<Record<keyof StakeholderInput, string>> = {};
  if (input.name.trim().length < 2) errors.name = "Enter a name";
  if (!STAKEHOLDER_ROLES.includes(input.role)) errors.role = "Choose a role";
  if (input.email?.trim() && !isValidEmail(input.email)) errors.email = "Enter a valid email address";
  return errors;
}
