import type { StatusTone } from "@/config/status-tone";

/**
 * Central status registry used across the application.
 * Add new statuses here instead of editing the StatusBadge component.
 */
export const STATUS_CONFIG: Record<string, StatusTone> = {
  // ==========================
  // General
  // ==========================
  Active: "success",
  Inactive: "neutral",
  Archived: "neutral",
  Disabled: "neutral",

  // ==========================
  // Workflow
  // ==========================
  Pending: "warning",
  Review: "warning",
  "In Review": "warning",
  Approved: "success",
  Rejected: "danger",
  Verified: "success",
  Draft: "neutral",
  // Proposals use "Revision Requested", engineering reports "Revision Required".
  "Revision Requested": "danger",
  "Revision Required": "danger",

  // ==========================
  // Employee
  // ==========================
  "On Leave": "warning",
  Suspended: "danger",

  // ==========================
  // Finance
  // ==========================
  Paid: "success",
  Unpaid: "danger",
  Overdue: "danger",
  Processing: "info",

  // ==========================
  // Procurement
  // ==========================
  Ordered: "info",
  Delivered: "success",
  Cancelled: "danger",

  // ==========================
  // Project
  // ==========================
  Planning: "warning",
  "In Progress": "info",
  Completed: "success",
  Delayed: "danger",
  Blocked: "danger",

  // ==========================
  // Risk
  // ==========================
  Low: "info",
  Medium: "warning",
  High: "danger",
  Critical: "danger",

  // ==========================
  // AI
  // ==========================
  Flagged: "danger",

  // ==========================
  // Finance — Budget (kebab-case enum values)
  // FIX: these were outstanding from the Budget Management build — the
  // budgetStatusEnum values are kebab-case and previously had no entries
  // here, so StatusBadge was silently falling through to "neutral" grey
  // for every budget/adjustment/approval-step status.
  // ==========================
  draft: "neutral",
  "pending-review": "warning",
  "finance-review": "warning",
  "manager-review": "warning",
  // FIX: budgetStatusEnum stores "approved"/"rejected" lowercase — these
  // are DIFFERENT, case-sensitive keys from "Approved"/"Rejected" above,
  // not the same entry. Both must exist or lowercase budget statuses fall
  // through to neutral grey.
  approved: "success",
  rejected: "danger",
  locked: "info",
  active: "success", // budget allocation status (lowercase — distinct key from "Active" above)
  
  // ==========================
  // Site Personnel — Tasks, Issues, Attendance verification
  // ==========================
  New: "info",
  Submitted: "info",
  "Under Review": "warning",
  Resolved: "success",
  Inside: "success",
  Outside: "danger",
  Edge: "warning",

  // ==========================
  // Attendance, requests (RFI/RFA) and email delivery. These had their own
  // colour maps next to their badges; they live here now so a word has one colour.
  // ==========================
  Present: "success",
  Absent: "danger",
  Late: "warning",
  "Half Day": "info",
  Open: "info",
  "Client replied": "brand",
  Answered: "success",
  "Approved as noted": "brand",
  Closed: "neutral",
  Sent: "success",
  "Not sent": "neutral",
  Failed: "danger",
};

const normalise = (s: string) => s.trim().toLowerCase().replace(/[-_]+/g, " ");
const NORMALISED = new Map<string, StatusTone>();
for (const [k, v] of Object.entries(STATUS_CONFIG)) {
  // First entry wins, so the capitalised key ("Active") beats a lowercase twin ("active").
  if (!NORMALISED.has(normalise(k))) NORMALISED.set(normalise(k), v);
}

/**
 * The one status-to-colour lookup. Exact key first (budget "active" and "Active"
 * are separate keys on purpose), then case and separator insensitive, so
 * "in_review", "In review" and "In Review" all read the same everywhere.
 */
export function statusTone(status: string): StatusTone {
  return STATUS_CONFIG[status] ?? NORMALISED.get(normalise(status)) ?? "neutral";
}

/**
 * Priority scale shared by every screen that shows Low / Medium / High / Critical
 * (engineering reports, site tasks). Same tones as the risk entries above, so a
 * "High" reads the same everywhere.
 */
export const PRIORITY_CONFIG: Record<string, StatusTone> = {
  Low: "info",
  Medium: "warning",
  High: "danger",
  Critical: "danger",
};
