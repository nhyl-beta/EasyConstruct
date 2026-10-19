import express from "express";
import designReviewsRoutes from "../src/designs/design-reviews/routes.js";
import designRevisionsRoutes from "../src/designs/design-revisions/routes.js";
import revisionsRoutes from "../src/revisions/routes.js";
import designRequestsRoutes from "../src/design-requests/routes.js";
import transmittalsRoutes from "../src/transmittals/routes.js";
import deliverablesRoutes from "../src/deliverables/routes.js";
import architectDocumentsRoutes from "./architect-documents/routes.js";
import blueprintsRoutes from "./blueprints/routes.js";
import designRoutes from "./designs/routes.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorMiddleware } from "./middleware/error.js";
import { logger } from "./middleware/logger.js";
import { requestId } from "./middleware/request-id.js";
import { securityHeaders } from "./middleware/security-headers.js";
import { cacheInvalidation } from "./cache/invalidate.js";
import projectRoutes from "./projects/routes.js";
import proposalRoutes from "./proposals/routes.js";
import hrRoutes from "./hr/routes.js";
import { authRoutes } from "./validators/routes.js";
import employeeRoutes from "./employees/routes.js";
import attendanceRoutes from "./attendance/routes.js";
import payrollRoutes from "./payroll/routes.js";
import workforceReportRoutes from "./workforce-reports/routes.js";
import taskRoutes from "./tasks/routes.js";
import issueRoutes from "./issues/routes.js";
import documentRoutes from "./documents/routes.js";
import payrollReviewRoutes from "./finance/payroll-review/routes.js";
import {
  authenticate,
  requireRole,
} from "./middleware/auth.js";

import { financeRouter } from "./routes/finance.js";
import notificationRoutes from "./notifications/route.js";
import auditLogRoutes from "./audit-logs/routes.js";
import requirementRoutes from "./requirements/routes.js";
import engineeringReportRoutes from "./engineering-reports/routes.js";
import roleRoutes from "./roles/routes.js";
import userRoutes from "./users/routes.js";
import projectMemberRoutes from "./project-members/routes.js";
import stakeholderRoutes from "./project-stakeholders/routes.js";
import userSettingsRoutes from "./user-settings/routes.js";
import publicReplyRoutes from "./design-requests/public-reply-routes.js";

// ── workflows/approvals ──
import workflowRoutes from "./workflows/routes.js";
import milestoneRoutes from "./milestones/routes.js";
import planSuggestionRoutes from "./plan-suggestion/routes.js";
import cronRoutes from "./jobs/routes.js";
import referenceRoutes from "./reference/routes.js";
import reconciliationRoutes from "./reconciliation/routes.js";
import decisionSupportRoutes from "./decision-support/routes.js";
import myActionsRoutes from "./lifecycle/my-actions.js";
import aiValidationRoutes from "./ai-validation/routes.js";
import calendarRoutes from "./calendar/routes.js";
import dashboardRoutes from "./dashboard/routes.js";

import uploadRoutes from "./uploads/routes.js";


const app = express();

// Uploads (design files, attendance photos, task completion evidence) POST a
// base64 data URL through this JSON body parser — see uploads/service.ts,
// which caps the *decoded* file at 8MB. Base64 inflates by ~4/3, so the
// request body can legitimately reach ~11MB. The default limit is 100kb, so
// every real file threw PayloadTooLargeError, which is neither a MulterError
// nor an AppError and fell through to the generic handler as a bare
// "Internal server error".
app.use(express.json({ limit: "12mb" }));
// Fix 1.5: baseline security headers on every API answer, and no framework banner.
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(corsMiddleware);
app.use(requestId);
app.use(logger);
// After any write that did not fail on the client's side, invalidate the cached reads it can change.
app.use(cacheInvalidation);

// Uploaded files are deliberately NOT served statically: project documents
// are private, so every stored file (Vercel Blob or local disk) is read
// through the authenticated GET /api/uploads/file route instead.

app.use("/api/projects", projectRoutes);
app.use("/api/designs", designRoutes);
app.use("/api/proposals", proposalRoutes);
app.use("/api/design-revisions", designRevisionsRoutes);
app.use("/api/revisions", revisionsRoutes);
app.use("/api/design-requests", designRequestsRoutes);
app.use("/api/transmittals", transmittalsRoutes);
app.use("/api/deliverables", deliverablesRoutes);
app.use("/api/design-reviews", designReviewsRoutes);
app.use("/api/architect-documents", architectDocumentsRoutes);
app.use("/api/blueprints", blueprintsRoutes)
app.use("/api/hr", hrRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/workforce-reports", workforceReportRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/issues", issueRoutes);
app.use("/api/documents", documentRoutes);

// Admin/IT Designer keep the same override they have on workflow-stage
// decisions, so a stuck payroll batch can still be cleared.
app.use(
  "/api/finance/payroll-review",
  authenticate,
  requireRole("finance-manager", "finance_manager", "admin", "it-designer"),
  payrollReviewRoutes,
);

// Every finance sub-route (budgets, expenses, budget-adjustments,
// budget-approval-steps, cash-flow, project-profitability, summary) was
// mountable with no token at all — GET /api/finance/budgets returned real
// contract figures to an anonymous caller. Reads stay open to any
// authenticated role; write-side role restrictions live in each
// sub-router (see finance/budget/routes.ts etc.), matching which roles'
// screens actually call them.
app.use("/api/finance", authenticate, financeRouter);
app.use("/api/notifications", notificationRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/requirements", requirementRoutes);
app.use("/api/engineering-reports", engineeringReportRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/users", userRoutes);
app.use("/api/project-members", projectMemberRoutes);
app.use("/api/stakeholders", stakeholderRoutes);
app.use("/api/me/settings", userSettingsRoutes);
// The only unauthenticated routes this feature adds: the RFI/RFA reply link, decided by a single-use token.
app.use("/api/public/rfi-replies", publicReplyRoutes);
app.use("/api/workflows", workflowRoutes);
app.use("/api/milestones", milestoneRoutes);
app.use("/api/plan-suggestions", planSuggestionRoutes);
// Scheduled jobs (Vercel Cron): guarded by CRON_SECRET, not by a user login.
app.use("/api/cron", cronRoutes);
// A signed-in person's own attendance and approved payslips (read-only).
// Shared clients and vendors (reference data with duplicate checks).
app.use("/api/reference", referenceRoutes);
// Read-only cross-checks over the stored numbers (Admin, IT Designer, Owner).
app.use("/api/admin/reconciliation", reconciliationRoutes);
// Usefulness of decision support: events from the screens, summary for Admin and Owner.
app.use("/api/decision-support", decisionSupportRoutes);
// K1: cross-project "what's waiting on me" — deliberately its own top-level
// mount, not nested under /api/projects/:id/lifecycle, since it spans every
// project the caller is relevant to rather than one.
app.use("/api/lifecycle", myActionsRoutes);
// A2: per-role calendar — milestones, workflow submissions, phase transitions.
app.use("/api/calendar", calendarRoutes);
// ai-signals E6: admin-only manual refresh of the cached cost catalog.
app.use("/api/ai-validation", aiValidationRoutes);
app.use("/api/uploads", uploadRoutes);
// Role-aware dashboard totals (replaces downloading full lists to count them in the browser).
app.use("/api/dashboard", dashboardRoutes);


app.use(errorMiddleware);

export default app;