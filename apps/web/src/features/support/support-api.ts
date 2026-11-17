import { apiClient } from "@/services/api.client";

export const SUPPORT_CATEGORIES = [
  { value: "password_reset", label: "Password reset" },
  { value: "email_change", label: "Email change" },
  { value: "role_access", label: "Role or access change" },
  { value: "cannot_sign_in", label: "Can't sign in" },
  { value: "other_account", label: "Other account issue" },
] as const;

export type SupportStatus = "open" | "in_progress" | "resolved" | "declined";

export interface SupportRequest {
  id: number;
  requesterName: string;
  requesterRole: string;
  category: string;
  subject: string;
  details: string;
  status: SupportStatus;
  resolutionNote: string | null;
  handledBy: string | null;
  handledAt: string | null;
  createdAt: string;
}

// "email_name_change" is the older category; tickets filed under it keep a readable label.
export const categoryLabel = (value: string) =>
  value === "email_name_change" ? "Email or name change" : (SUPPORT_CATEGORIES.find((c) => c.value === value)?.label ?? value);

export const supportApi = {
  create: (input: { category: string; subject: string; details: string }) => apiClient.post("/support-requests", input),
  update: (id: number, input: { status: SupportStatus; resolutionNote?: string }) => apiClient.patch(`/support-requests/${id}`, input),
};
