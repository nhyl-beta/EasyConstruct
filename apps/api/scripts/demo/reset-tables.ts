// Which tables `npm run demo:reset` keeps, deletes, or handles specially. Split out of reset-demo-data.ts (which
// runs the reset when imported) so reset-tables.test.ts can check it against the Drizzle schema: a new table that is
// not classified here fails that test instead of surfacing when someone runs the reset.
//
// document_types is reference data: its system rows are read by name (lifecycle/gates.ts, the report types), so it is kept.

/** Never written. Checksummed before/after. */
export const ACCOUNT_TABLES = ["users", "password_reset_tokens", "roles"];
/** Never deleted (config / reference / history). */
export const PRESERVE = [...ACCOUNT_TABLES, "workflow_templates", "reference_snapshots", "audit_logs", "expense_categories", "document_types"];
/** Handled specially. */
export const SPECIAL = ["notifications", "employees"];

/** Delete order: children before parents (derived from the real FK map). */
export const DELETE_ORDER = [
  "validation_results", "workflow_attachments", "workflow_line_items", "workflow_stages",
  "plan_suggestion_items", "plan_suggestions", "signal_findings", "decision_support_events",
  "proposals", "workflows",
  "budget_adjustments", "budget_allocations", "budget_approval_steps", "budget_comments",
  "budget_documents", "budget_history", "budgets",
  // Purchasing first: purchase_requests.requirement_id references requirements.
  "procurement_orders", "purchase_requests", "reimbursements",
  "milestone_links", "milestones", "tasks", "issues", "requirements",
  "architect_documents", "blueprints", "design_reviews", "design_revisions", "design_engineers", "designs",
  "revisions", "engineering_reports", "documents", "expenses", "financial_risks", "cash_flow_entries",
  "ai_insights", "approvals_queue",
  "scheduled_reports", "payroll", "payroll_batch_decisions", "payroll_batch_acknowledgements", "payroll_batches", "attendance",
  "transmittal_acknowledgements", "transmittal_items", "transmittals",
  // Reply tokens hang off recipients, recipients off requests (all ON DELETE cascade, listed child-first anyway).
  "design_request_reply_tokens", "design_request_recipients", "design_request_files", "design_requests",
  "project_deliverables",
  "project_phase_history", "project_members", "project_stakeholders", "overdue_reminders", "projects", "clients", "vendors",
  // Integrity records of uploaded files; the documents and attachments that pointed at them are gone with the projects.
  "stored_files",
];

/** Tables in the database that no list above covers (the reset refuses to run while there are any). */
export const unclassifiedTables = (tables: string[]): string[] => {
  const known = new Set([...PRESERVE, ...SPECIAL, ...DELETE_ORDER]);
  return tables.filter((t) => !known.has(t) && !t.startsWith("__drizzle") && t !== "drizzle_migrations");
};
