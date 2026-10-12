// Files that render a table body or a list of records without referencing
// pagination themselves, and why that is fine. The test in
// pagination-exempt.test.ts fails if a new file does the same and is not listed
// here, and if a listed file no longer needs the exemption.
//
// Valid reasons: the list is small and fixed by design, a dashboard widget that
// shows a fixed top N, a form or dialog control, a print page, or the file only
// receives an already-paged array from a parent that paginates.

export interface PaginationExemption {
  file: string;
  reason: string;
}

const WIDGET = "Dashboard widget with a fixed top-N (the server or a slice caps it); the full list is on a paginated page.";
const PARENT = "Receives an already-paged array; the parent page paginates.";

export const PAGINATION_EXEMPT: PaginationExemption[] = [
  // ── Navigation and shell
  { file: "components/refine-ui/layout/sidebar.tsx", reason: "Navigation menu; fixed by role." },
  { file: "components/notifications/notification-bell.tsx", reason: "Pages itself: 8 at a time with a Show more button." },
  { file: "features/quick-search/QuickSearchPalette.tsx", reason: "Command palette; the result list is capped." },
  { file: "features/calendar/components/CalendarWidget.tsx", reason: "Month grid; fixed 7-column calendar, not a record list." },

  // ── Receive an already-paged array
  { file: "features/projects/components/ProjectsGrid.tsx", reason: `${PARENT} (pm-projects, admin-projects, owner-portfolio use ProjectsPagination.)` },
  { file: "features/projects/components/ProjectsTable.tsx", reason: `${PARENT} (same three pages.)` },
  { file: "features/proposals/components/ProposalsTable.tsx", reason: `${PARENT} (ProposalsRegister renders DataTablePagination.)` },
  { file: "features/revisions/components/RevisionsTable.tsx", reason: `${PARENT} (architect-revisions pages on the server.)` },
  { file: "pages/roles/architect/architect-revisions.tsx", reason: "Server-paged; has its own 'Showing X–Y of N' footer with previous/next." },

  // ── Forms, dialogs and per-item detail
  { file: "components/workflows/WorkflowCard.tsx", reason: "Stages of one workflow; a fixed short pipeline." },
  { file: "components/workflows/workflow-stage-pipeline.tsx", reason: "Stages of one workflow; a fixed short pipeline." },
  { file: "components/workflows/new-workflow-dialog.tsx", reason: "Form: stage and option editors in a dialog." },
  { file: "components/workflows/new-workflow-template-dialog.tsx", reason: "Form: stage editor in a dialog." },
  { file: "components/workflows/workflow-submission-panel.tsx", reason: "Form: the line items of the one submission being filled in." },
  { file: "components/shared/submitted-files.tsx", reason: "Files attached to one item; a short per-item list." },
  { file: "components/users/user-account-dialog.tsx", reason: "Form: role options in a dialog." },
  { file: "features/projects/pages/ProjectCreatePage.tsx", reason: "Wizard: option lists and pickers, no record list." },
  { file: "features/finance/components/CategorySelect.tsx", reason: "Dropdown control: the options of a form field (the managed category list); the full list is paginated in the Manage categories dialog." },
  { file: "features/requests/components/TransmittalBuilderDialog.tsx", reason: "Dialog: picking the items for one transmittal." },
  { file: "features/requests/components/RequestDetailSheet.tsx", reason: "Attachments and follow-ups of one request (a thread)." },
  { file: "features/lifecycle/components/CloseoutSummaryCard.tsx", reason: "One row per budget category of one project; small and fixed." },
  { file: "features/tasks/components/AssigneeSuggestions.tsx", reason: "The top three ranked suggestions for one task; fixed by the ranking rules." },
  { file: "features/plan-suggestions/components/SuggestedPlanPanel.tsx", reason: "The items of one drafted plan (a template of about 60 items); the PM reviews them one by one." },
  { file: "features/workflows/components/ImpactForecastCard.tsx", reason: "The open milestones of one project that a change would move; bounded by that project." },
  { file: "features/hr/components/AttendanceExceptionsPanel.tsx", reason: "Server-paged (GET /attendance/exceptions?page=); has its own previous/next controls." },
  { file: "features/lifecycle/components/DecisionSupportSection.tsx", reason: "The few advisory signals for one decision." },
  { file: "features/lifecycle/components/ProjectLifecyclePanel.tsx", reason: "Phase path, checks and history of one project; bounded by the lifecycle phases." },
  { file: "pages/roles/site-personnel/sp-attendance.tsx", reason: "Project picker for the projects the person is staffed on." },
  { file: "pages/roles/finance/finance-reports.tsx", reason: "Report-type chooser and the handful of scheduled-report definitions." },
  { file: "pages/roles/finance/finance-ai-insight.tsx", reason: "AI-generated insights and risks; a small fixed set per run." },
  { file: "pages/roles/shared/shared-resources.tsx", reason: "Static templates and links." },
  { file: "pages/roles/shared/print-pages.tsx", reason: "Print pages print everything by design." },
  { file: "pages/roles/admin/admin-approval-hierarchy.tsx", reason: "The few workflow templates and their stages; fixed by configuration." },
  { file: "pages/roles/admin/admin-workflow-configuration.tsx", reason: "The few workflow templates and their stages; fixed by configuration." },
  { file: "pages/roles/admin/admin-roles-permissions.tsx", reason: "The fixed list of roles." },
  { file: "pages/roles/owner/owner-account-recovery.tsx", reason: "The fixed set of IT Designer recovery targets." },

  // ── Dashboard widgets (fixed top N)
  { file: "features/requests/components/AttentionCard.tsx", reason: WIDGET },
  { file: "features/requests/components/ProjectRequestsSection.tsx", reason: WIDGET },
  { file: "features/payroll-summary/components/OwnerPayrollSection.tsx", reason: "Ranked top-N aggregates and chart legends; the batches themselves are paginated on the Finance and HR pages." },
  { file: "pages/roles/admin/admin-dashboard.tsx", reason: WIDGET },
  { file: "pages/roles/architect/architect-dashboard.tsx", reason: WIDGET },
  { file: "pages/roles/consultant/consultant-dashboard.tsx", reason: WIDGET },
  { file: "pages/roles/engineer/engineer-dashboard.tsx", reason: WIDGET },
  { file: "pages/roles/it-designer/it-designer-dashboard.tsx", reason: "Users-by-role summary; one row per role." },
  { file: "pages/roles/owner/owner-dashboard.tsx", reason: WIDGET },
  { file: "pages/roles/project-manager/pm-dashboard.tsx", reason: WIDGET },
  { file: "pages/roles/site-personnel/sp-dashboard.tsx", reason: WIDGET },
  { file: "pages/roles/human-resources/hr-dashboard.tsx", reason: "Overview tabs built on static sample data from providers/mock-data (not API records); the real employee, attendance and payroll lists are paginated on their own pages." },
];
