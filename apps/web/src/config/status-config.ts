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
  Low: "success",
  Medium: "info",
  High: "warning",
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
  Submitted: "info",
  "Under Review": "warning",
  Resolved: "success",
  Inside: "success",
  Outside: "danger",
  Edge: "warning",
};
