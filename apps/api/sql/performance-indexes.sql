-- server/sql/performance-indexes.sql
--
-- Secondary indexes for the queries the application actually runs
-- (see docs/PERFORMANCE_AUDIT.md section 3). NOT a Drizzle migration and NOT
-- applied automatically: the owner runs it by hand, ONE STATEMENT AT A TIME in
-- the Neon SQL editor, staging first.
--
--   * Every statement is idempotent (CREATE INDEX IF NOT EXISTS).
--   * Plain CREATE INDEX takes a short write lock on the table. These tables
--     are small enough for that to be fine; if you prefer, run the statements
--     with CREATE INDEX CONCURRENTLY outside a transaction instead.
--   * Indexes that already exist from migrations / ensure-demo-schema.ts and
--     are therefore NOT repeated here: milestones_project_code_idx,
--     milestone_links_milestone_idx, project_phase_history_project_code_idx,
--     workflow_attachments_workflow_idx, workflow_line_items_workflow_idx,
--     design_requests_project_idx, design_requests_assignee_idx,
--     revisions_project_idx, and the unique indexes on
--     transmittals (project_code, sequence) and payroll_batch_decisions
--     (batch_id, round).
--   * To undo one: DROP INDEX IF EXISTS <name>;
--   * Check a plan afterwards, for example:
--       EXPLAIN (ANALYZE, BUFFERS)
--       SELECT * FROM attendance WHERE log_date = current_date;
--   * Not included on purpose: trigram (GIN) indexes for the ilike '%term%'
--     searches. They need the pg_trgm extension, which nothing in this
--     repository enables - see the owner decision at the end of this file.

-- ── Attendance ──────────────────────────────────────────────────────────────
-- attendance/repository.ts buildConditions + findPage: date range filter and
-- "newest first" ordering (log_date desc, clock_in desc, id desc); HR day
-- summary (hr/aggregates.ts attendanceDayCounts) and the 14-day heatmap
-- (attendance/repository.ts findSince).
CREATE INDEX IF NOT EXISTS idx_attendance_log_date ON attendance (log_date DESC);

-- attendance/repository.ts findAll / findPage with employeeId, and
-- GET /attendance?employeeId= from the Site Personnel screens.
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance (employee_id, log_date DESC);

-- attendance/repository.ts findVerified / findForProject (payroll readiness
-- and attendance summary per project and period).
CREATE INDEX IF NOT EXISTS idx_attendance_project_date ON attendance (project_code, log_date);

-- ── Payroll ─────────────────────────────────────────────────────────────────
-- payroll/repository.ts findByBatch / findByBatches (batch detail, validation,
-- contribution reports) and payroll/owner-summary.repository.ts GROUP BY batch_id.
CREATE INDEX IF NOT EXISTS idx_payroll_batch_id ON payroll (batch_id);

-- payroll/repository.ts findAll({ period }) and hr/repository.ts findPayroll;
-- workforce-reports/service.ts payroll summary filtered by period.
CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll (period);

-- payroll/service.ts getAll filtered by employee.
CREATE INDEX IF NOT EXISTS idx_payroll_emp_id ON payroll (emp_id);

-- Finance approvals + dashboard (finance/approvals/repository.ts
-- pendingPayroll, finance/summary/repository.ts pending count),
-- payroll/batch-repository.ts findDraftIds / findApprovedForPeriod.
CREATE INDEX IF NOT EXISTS idx_payroll_batches_status ON payroll_batches (status);

-- payroll/batch-repository.ts findSameProjectPeriod (duplicate-batch check),
-- lifecycle snapshot (payroll batches of one project).
CREATE INDEX IF NOT EXISTS idx_payroll_batches_project_period ON payroll_batches (project_code, period);

-- payroll/batch-repository.ts findAll ordering (created_at desc).
CREATE INDEX IF NOT EXISTS idx_payroll_batches_created_at ON payroll_batches (created_at DESC);

-- ── Projects and membership ─────────────────────────────────────────────────
-- projects/repository.ts buildConditions: list filter by status
-- (excludeArchived, status) and the ordering case on status.
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status);

-- projects/repository.ts pmScope + findCodesForPm: Project Manager scope.
CREATE INDEX IF NOT EXISTS idx_projects_pm_user_id ON projects (pm_user_id);

-- projects/repository.ts pmScope fallback (pm_user_id IS NULL AND pm = name);
-- documents/repository.ts findProjectCodesForPm.
CREATE INDEX IF NOT EXISTS idx_projects_pm ON projects (pm);

-- projects/service.ts assignedProjectCodes, project-members/repository.ts
-- findAll({ userId }), notifications/service.ts and lifecycle snapshot.
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members (user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project_role ON project_members (project_code, role);

-- ── Workflows and approvals ─────────────────────────────────────────────────
-- workflows/repository.ts findWorkflows(status), findWorkflowsForProjects,
-- countActiveByTemplate, lifecycle snapshot; newest-first ordering.
CREATE INDEX IF NOT EXISTS idx_workflows_project_code ON workflows (project_code);
CREATE INDEX IF NOT EXISTS idx_workflows_status_created ON workflows (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflows_template_id ON workflows (template_id);

-- workflows/repository.ts findStagesForWorkflows / findStagesByWorkflow
-- (workflow_id, sequence ordering) and the cascade delete from workflows.
CREATE INDEX IF NOT EXISTS idx_workflow_stages_workflow_seq ON workflow_stages (workflow_id, sequence);

-- Approvals queue and badge: pending stages for a role
-- (workflows/repository.ts findPendingStagesForRole, approvals/stats).
CREATE INDEX IF NOT EXISTS idx_workflow_stages_role_status ON workflow_stages (role, status);

-- ── Proposals, documents, designs ───────────────────────────────────────────
-- proposals list (ORDER BY id desc is the primary key), lifecycle snapshot
-- (project_code), findByWorkflowId (workflow_id), status filters.
CREATE INDEX IF NOT EXISTS idx_proposals_project_code ON proposals (project_code);
CREATE INDEX IF NOT EXISTS idx_proposals_workflow_id ON proposals (workflow_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals (status);

-- documents/repository.ts findAll filters (project, type, stage), lifecycle snapshot.
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents (project);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents (type);

-- designs/repository.ts findAll({ projectCode, status }), findProjectCodesByIds,
-- lifecycle snapshot.
CREATE INDEX IF NOT EXISTS idx_designs_project_code ON designs (project_code);
CREATE INDEX IF NOT EXISTS idx_designs_status ON designs (status);

-- Foreign keys joined or filtered by design id: design-reviews, design-revisions,
-- blueprints, architect-documents repositories and the lifecycle snapshot.
CREATE INDEX IF NOT EXISTS idx_design_reviews_design_id ON design_reviews (design_id);
CREATE INDEX IF NOT EXISTS idx_design_revisions_design_id ON design_revisions (design_id);
CREATE INDEX IF NOT EXISTS idx_blueprints_design_id ON blueprints (design_id);
CREATE INDEX IF NOT EXISTS idx_blueprints_project_code ON blueprints (project_code);
CREATE INDEX IF NOT EXISTS idx_architect_documents_design_id ON architect_documents (design_id);

-- ── Tasks, issues, requirements, reports, milestones ────────────────────────
-- tasks/repository.ts findAll filters, lifecycle snapshot, site-personnel "mine".
CREATE INDEX IF NOT EXISTS idx_tasks_project_code ON tasks (project_code);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_user_id ON tasks (assigned_to_user_id);

-- issues/repository.ts findAll filters (project, status), reporter, lifecycle
-- snapshot and issue precedents (status = 'Resolved' AND category IN (...)).
CREATE INDEX IF NOT EXISTS idx_issues_project_code ON issues (project_code);
CREATE INDEX IF NOT EXISTS idx_issues_status_category ON issues (status, category);
CREATE INDEX IF NOT EXISTS idx_issues_reported_by_user_id ON issues (reported_by_user_id);

-- requirements/repository.ts filters and lifecycle snapshot.
CREATE INDEX IF NOT EXISTS idx_requirements_project_status ON requirements (project, status);

-- engineering-reports/repository.ts filters and lifecycle snapshot.
CREATE INDEX IF NOT EXISTS idx_engineering_reports_project ON engineering_reports (project);

-- milestones/repository.ts findMilestonesLinkedToTask (link_type = 'task' AND link_id = ?).
CREATE INDEX IF NOT EXISTS idx_milestone_links_type_link ON milestone_links (link_type, link_id);

-- ── Employees and users ─────────────────────────────────────────────────────
-- employees/repository.ts + hr/repository.ts findEmployees filters, HR day
-- summary (status = 'Active'), workforce aggregates GROUP BY department / site.
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees (status);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees (department);

-- employees/repository.ts findByUserId and the lifecycle snapshot
-- (employees WHERE user_id IN (...)).
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees (user_id);

-- users/repository.ts role filter, roles page counts.
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- ── Notifications and audit ─────────────────────────────────────────────────
-- notifications/repository.ts findForRecipient: rows addressed to a user,
-- newest first. (Index only - the query and its live behavior are unchanged.)
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created ON notifications (recipient_user_id, created_at DESC);
-- ...and role-addressed rows with no named recipient.
CREATE INDEX IF NOT EXISTS idx_notifications_role_created ON notifications (role, created_at DESC) WHERE recipient_user_id IS NULL;

-- audit-logs/repository.ts findAll / findCount: ORDER BY created_at DESC,
-- date range filters, and the dashboards' recent-activity reads.
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- audit-logs/repository.ts findRecentSessions / findFailedLogins / countFailedLogins
-- (entity_type = 'auth' AND action = ...).
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_action_created ON audit_logs (entity_type, action, created_at DESC);

-- audit-logs filter by actor / project_code / entity.
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor);
CREATE INDEX IF NOT EXISTS idx_audit_logs_project_code ON audit_logs (project_code);

-- ── Finance ─────────────────────────────────────────────────────────────────
-- finance/expenses/repository.ts findMany (ORDER BY submitted_at DESC), and
-- finance/approvals/repository.ts pendingExpenses (status = 'pending').
CREATE INDEX IF NOT EXISTS idx_expenses_submitted_at ON expenses (submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses (status);
CREATE INDEX IF NOT EXISTS idx_expenses_project ON expenses (project);

-- finance/budget/repository.ts filters, finance/approvals/repository.ts
-- pendingBudgets (status = 'finance-review'), project-profitability GROUP BY project,
-- lifecycle snapshot (budgets of one project).
CREATE INDEX IF NOT EXISTS idx_budgets_project ON budgets (project);
CREATE INDEX IF NOT EXISTS idx_budgets_status ON budgets (status);

-- Budget child tables read by budget_id (foreign keys, no index today):
-- finance/budget-adjustments, budget-approval-steps and the budget detail view.
CREATE INDEX IF NOT EXISTS idx_budget_adjustments_budget_id ON budget_adjustments (budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_approval_steps_budget_id ON budget_approval_steps (budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_comments_budget_id ON budget_comments (budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_documents_budget_id ON budget_documents (budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_history_budget_id ON budget_history (budget_id);

-- ── Requests, validation ────────────────────────────────────────────────────
-- design-requests/repository.ts findOpenByProject(s) (project_code + status NOT IN ...),
-- Admin "needs attention" (status IN ('open','in_review') AND due_date < now()).
CREATE INDEX IF NOT EXISTS idx_design_requests_status_due ON design_requests (status, due_date);

-- transmittals/repository: items of a transmittal.
CREATE INDEX IF NOT EXISTS idx_transmittal_items_transmittal_id ON transmittal_items (transmittal_id);

-- lifecycle/repository.ts loadSnapshots (validation_results WHERE project_code IN (...)).
CREATE INDEX IF NOT EXISTS idx_validation_results_project_code ON validation_results (project_code);

-- ── Owner decision: trigram search ──────────────────────────────────────────
-- The ilike '%term%' searches (projects name/code/pm, employees name/employee_id/role,
-- audit_logs actor/summary, expenses vendor) cannot use the b-tree indexes
-- above. If pg_trgm is acceptable on the Neon project, run once:
--     CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- and then, for example:
--     CREATE INDEX IF NOT EXISTS idx_projects_name_trgm ON projects USING gin (name gin_trgm_ops);
--     CREATE INDEX IF NOT EXISTS idx_employees_name_trgm ON employees USING gin (name gin_trgm_ops);
-- Not run or assumed by the application.
