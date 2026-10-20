EasyConstruct Demo Walkthrough
This is grounded in the actual construction-system-easyconstruct repo as it stands today — not just the thesis paper's scope — so every step below is something the app can genuinely do. Where a feature exists in the thesis but isn't wired up in code yet, it's called out so you don't get caught by it live.

The demo follows one project through all 8 roles, in the order the work actually happens: Admin sets the stage → PM starts the project → Architect designs it → Consultant & Finance weigh in through an approval workflow → Engineer & Site Personnel execute it → HR turns attendance into payroll → Finance signs off → Admin shows the audit trail. That hand-off chain is the "interaction between roles" your panel will want to see, because it's the same real data moving through each screen, not eight disconnected logins.

Part 1 — Before you start
1.1 Run both servers
npm run dev
from the repo root (this runs client and server together via scripts/dev.mjs). Or run them separately with npm run dev:client / npm run dev:server.

1.2 Set VITE_API_BASE — do this or three modules will silently show fake data
Most of the app talks to the backend through a Vite dev proxy (/api → http://localhost:8000) and works with zero config. But Projects, Requirements, and Engineering Reports check a VITE_API_BASE env var to decide whether to call the real API or fall back to hardcoded mock data (USE_API = Boolean(import.meta.env.VITE_API_BASE)). If that variable is unset, those three modules will look fine on screen but won't be touching your database at all — which is exactly the kind of thing that unravels mid-defense when someone asks "can you refresh that."

Create client/.env.local:

VITE_API_BASE=http://localhost:8000
Restart the client dev server after adding it.

1.3 There's no sign-up page — seed your demo accounts
The app only has a login screen; there's no registration flow and no db:seed script in the repo. Every account has to exist in the database before you log in with it. Add the script below to your project and run it once.

Create server/src/scripts/seed-demo-accounts.ts:

// One-time setup: one login per role, plus a matching employee record,
// so attendance/payroll/assignment screens have something real to show.
// Run: cd server && npx tsx src/scripts/seed-demo-accounts.ts
// Safe to re-run — existing emails are skipped.

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users } from "../db/schema/users.js";
import { employees } from "../db/schema/employees.js";

const PASSWORD = "Demo@12345"; // change this after the defense

const ACCOUNTS = [
  { name: "Sam Cruz",       email: "superadmin@easyconstruct.demo", role: "super-admin",    employeeRole: "Super Admin",         department: "Administration" },
  { name: "Dana Reyes",     email: "admin@easyconstruct.demo",      role: "admin",           employeeRole: "Admin",               department: "Administration" },
  { name: "Miguel Santos",  email: "pm@easyconstruct.demo",         role: "project-manager", employeeRole: "Project Manager",     department: "Project Management" },
  { name: "Liza Torres",    email: "hr@easyconstruct.demo",         role: "human-resources", employeeRole: "HR Officer",          department: "Human Resources" },
  { name: "Carlo Ramos",    email: "finance@easyconstruct.demo",    role: "finance-manager", employeeRole: "Finance Manager",     department: "Finance" },
  { name: "Ana Villanueva", email: "architect@easyconstruct.demo",  role: "architect",       employeeRole: "Architect",           department: "Design" },
  { name: "Paolo Mendoza",  email: "engineer@easyconstruct.demo",   role: "engineer",        employeeRole: "Site Engineer",       department: "Engineering" },
  { name: "Rico Domingo",   email: "site@easyconstruct.demo",       role: "site-personnel",  employeeRole: "Construction Worker", department: "Field Operations" },
  { name: "Elena Bautista", email: "consultant@easyconstruct.demo", role: "consultant",      employeeRole: "Consultant",          department: "Advisory" },
];

async function main() {
  const hashed = await bcrypt.hash(PASSWORD, 10);
  let created = 0;

  for (const [i, acct] of ACCOUNTS.entries()) {
    const [existing] = await db.select().from(users).where(eq(users.email, acct.email));
    if (existing) { console.log(`skip (exists): ${acct.email}`); continue; }

    const [user] = await db
      .insert(users)
      .values({ name: acct.name, email: acct.email, password: hashed, role: acct.role })
      .returning();

    await db.insert(employees).values({
      employeeId: `EMP-DEMO-${String(i + 1).padStart(2, "0")}`,
      name: acct.name,
      initials: acct.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
      role: acct.employeeRole,
      department: acct.department,
      site: "Main Site",
      hiredOn: new Date().toISOString().slice(0, 10),
      email: acct.email,
      userId: user!.id,
    });

    created++;
    console.log(`created: ${acct.email} (${acct.role})`);
  }

  console.log(`\nDone. ${created} of ${ACCOUNTS.length} accounts created.`);
  console.log(`Password for all demo accounts: ${PASSWORD}`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
1.4 Seed at least one workflow template
The approval-workflow screen (used by PM, Finance, Architect, Engineer, Consultant, and Admin) requires picking an existing template — there's no "build stages from scratch" option in the UI, and no template ships in the repo, so "New Workflow" will be a dead end with an empty dropdown until one exists.

Add this to the same script (or a second one) before main():

import { workflowTemplates } from "../db/schema/workflows.js";

async function seedTemplates() {
  const existing = await db.select().from(workflowTemplates);
  if (existing.length > 0) { console.log("templates already exist, skipping"); return; }

  await db.insert(workflowTemplates).values([
    {
      name: "Design Proposal Approval",
      description: "Architect submits a design; Consultant reviews it; PM signs off.",
      avgDurationHours: "48",
      defaultStages: [
        { role: "architect", roleLabel: "Architect Submission", iconKey: "FileSignature" },
        { role: "consultant", roleLabel: "Consultant Review", iconKey: "UserCheck" },
        { role: "project-manager", roleLabel: "PM Approval", iconKey: "ShieldCheck" },
      ],
    },
    {
      name: "Budget Change Request",
      description: "Engineer justifies a change; Finance reviews cost impact; PM and Admin sign off.",
      avgDurationHours: "72",
      defaultStages: [
        { role: "engineer", roleLabel: "Engineer Justification", iconKey: "FileSignature" },
        { role: "finance-manager", roleLabel: "Finance Review", iconKey: "Wallet" },
        { role: "project-manager", roleLabel: "PM Sign-off", iconKey: "ShieldCheck" },
        { role: "admin", roleLabel: "Admin Final Approval", iconKey: "ShieldCheck" },
      ],
    },
  ]);
  console.log("2 workflow templates created.");
}
Call await seedTemplates(); at the top of main().

1.5 Have this table on hand while you demo
Role	Email	Password
Super Admin	superadmin@easyconstruct.demo	Demo@12345
Admin	admin@easyconstruct.demo	Demo@12345
Project Manager	pm@easyconstruct.demo	Demo@12345
Human Resources	hr@easyconstruct.demo	Demo@12345
Finance Manager	finance@easyconstruct.demo	Demo@12345
Architect	architect@easyconstruct.demo	Demo@12345
Engineer	engineer@easyconstruct.demo	Demo@12345
Site Personnel	site@easyconstruct.demo	Demo@12345
Consultant	consultant@easyconstruct.demo	Demo@12345
Fastest way to switch roles live: open a private/incognito window per role, or just log out (top-right) and log back in — there's no role switcher, each is a real, separate login.

Part 2 — The story you're demoing
"Sunrise Heights" — a mid-rise residential project, moving through the system from creation to payroll, touching every role along the way:

Admin
sets up roles & workflow config

Project Manager
creates project & workflow

Architect
submits design proposal

Consultant
reviews proposal

Finance Manager
reviews budget impact

PM
final approval

Engineer
assigned, drafts requirements

Site Personnel
logs attendance & tasks

HR
verifies attendance, runs payroll

Finance
approves payroll batch

Admin
reviews audit trail

Run the steps below in this order, switching accounts as indicated.

Part 3 — Step-by-step script
Step 1 — Admin: set the stage
Log in as Admin (admin@easyconstruct.demo).

Dashboard (/dashboard) — live data pulled from real projects/employees/attendance via useAdminDashboardController. Point out this is the org-wide view.
Roles & Permissions (/admin/roles-permissions) — show the role list backing every login you're about to use.
Workflow Configuration (/admin/workflow-configuration) / Approval Hierarchy (/admin/approval-hierarchy) — this is where the two templates you seeded live conceptually; mention that Admin is who defines which roles sit in an approval chain.
Security (/admin/security) — this page is real: it filters the live audit log for rejected/deleted events. It's empty right now — you'll come back to it at the very end once other roles have generated activity.
Skip: the small "Login & session monitoring" card at the bottom of Security is explicitly marked not-yet-built in the code — don't dwell on it.

Step 2 — Project Manager: start the project
Log out, log in as Project Manager (pm@easyconstruct.demo).

Dashboard (/dashboard) — composed from real useProjects/useEmployees/useAttendance hooks.
Projects → New Project (/projects/new): create "Sunrise Heights". This form is a real, multi-step create flow that posts to the API (ProjectRepository.create) — fill in client, location, budget, dates, and pick a PM from the real user list.
Open the new project's detail page (/projects/:projectId) and use Assign Engineer to add engineer@easyconstruct.demo to the project — this pulls the real list of Engineer-role users and writes to the project-engineers table. This is your first live cross-role link: the Engineer account you'll use in Step 6 is now actually attached to this project.
Workflows (/workflows) → New Workflow: title it "Sunrise Heights — Design Approval", project code matches what you just created, template = Design Proposal Approval. Submitting this creates a real workflows row with three ordered stages (Architect → Consultant → PM), the first one marked "current."
Step 3 — Architect: submit the design
Log in as Architect (architect@easyconstruct.demo).

Dashboard — mostly live (KPIs), with a small "Coming soon" panel for a blueprint library/AI variations — don't linger there.
Designs → New Design or Blueprints (/blueprints) — upload/create a design tied to Sunrise Heights (useBlueprints, backed by /api/blueprints).
Proposals (/proposals) — submit a project proposal referencing the design.
Approvals (/approvals) — this is the same generic approvals screen every role uses, filtered to this role. The Architect will see the "Architect Submission" stage of your workflow sitting as current. Approve it — the workflow automatically advances to the Consultant stage.
Note: architect-reviews.tsx, architect-revisions.tsx, and architect-documentation.tsx are fully working, hook-driven pages (useDesignReviews, useDesignRevisions, useArchitectDocuments) — but the sidebar's own nav config still points their labels at /dashboard as a leftover TODO. If you want to show them, navigate directly to /reviews, /revisions, or /architect/documents in the address bar; don't rely on clicking the sidebar for those three.

Step 4 — Consultant: review the proposal
Log in as Consultant (consultant@easyconstruct.demo).

Proposal Review (/consultant/proposals) — review the proposal Architect submitted; this is real proposal data (/api/proposals), not mock.
Advisory Docs (/advisory-docs) — upload a short advisory note (uses the same shared documents upload endpoint as PM/Admin/Site Personnel).
Approvals (/approvals) — the Consultant now sees the workflow's second stage as current. Approve it — stage advances to Project Manager.
Step 5 — Project Manager: close the loop on the approval
Log back in as Project Manager.

Approvals (/approvals) — the PM's own "PM Approval" stage is now current (it moved automatically after the Consultant's decision). Approve it — since this was the last stage in the template, the workflow status flips to completed. This is the clearest single moment to show the panel: three different logins, one workflow record, moving in sequence.
Optional: back in Workflows → New Workflow, create a second one from the Budget Change Request template to show a 4-role chain (Engineer → Finance → PM → Admin) if you have time — same mechanism, longer chain.
Step 6 — Engineer: technical execution
Log in as Engineer (engineer@easyconstruct.demo).

Dashboard — composed via useEngineerDashboardController.
Requirements (/requirements) — draft a technical requirement for Sunrise Heights (real API-backed, per your VITE_API_BASE setting from Part 1).
Progress (/progress) — log a progress/milestone update.
Tasks: create a task for the project (Engineer is allowed to create tasks, same as PM) — this is what Site Personnel will update next.
Issues (/issues) — you'll come back here after Site Personnel files one.
Step 7 — Site Personnel: fieldwork
Log in as Site Personnel (site@easyconstruct.demo).

Attendance (/attendance) — log today's attendance. This is the record HR will process into payroll in Step 8.
Tasks (/tasks) — mark the task Engineer created as in-progress/complete.
Documents (/documents) — upload a field photo/report (same shared upload endpoint).
Issues (/issues) — file an issue (e.g. "material delay on Level 3"). Only Site Personnel and Engineer can create issues; only PM and Engineer can resolve them.
Log back in as Engineer briefly to show Issues → update status — resolving the issue Site Personnel just filed. This is a second clean two-role hand-off to point out.

Step 8 — HR: turn attendance into payroll
Log in as Human Resources (hr@easyconstruct.demo).

Attendance (/attendance) — verify/edit the record Site Personnel logged (HR, PM, and Admin can all edit attendance; only Site Personnel and Admin can create it).
Employees (/employees) — show the roster, including the demo accounts you seeded (each linked to a real login via userId).
Payroll → Generate Payroll — generate a batch from that attendance data. This posts to a real payroll-batch endpoint.
Step 9 — Finance Manager: sign off
Log in as Finance Manager (finance@easyconstruct.demo).

Payroll Review (/payroll-review) — the batch HR just generated appears here. Approve or reject it — this is a real decision endpoint, role-gated so only Finance Manager (or Admin) can call it.
Budget (/budget) — show budget allocations/spend for Sunrise Heights.
Approvals (/approvals) — if you created the Budget Change Request workflow in Step 5, Finance's stage will be sitting here waiting on a decision.
Skip: "Impact Review" (AI-generated budget/timeline impact summaries) is a full placeholder page in the code and isn't linked from Finance's own sidebar at all — don't try to find it during the demo.

Step 10 — Admin: show the paper trail
Log back in as Admin.

Activity Logs (/admin/activity-logs) — every action across the last nine steps (project creation, workflow decisions, attendance edits, payroll approval) is queryable here from the real audit_logs table.
Security (/admin/security) — if anything got rejected during your walkthrough, it'll surface here now, closing the loop from Step 1.
Part 4 — What's real vs. what's still "Coming Soon"
Say this plainly if a panelist clicks somewhere you didn't plan for — it's more credible than pretending everything is finished:

Fully working, backed by the real database (safe to demo deeply): Projects, Employees, HR (attendance/payroll/workforce), PM Dashboard, Documents (shared upload across roles), Engineer's Requirements & Progress & Issues, Architect's Designs/Blueprints/Proposals/Reviews/Revisions/Documentation, Consultant's Proposal Review & Advisory Docs, Finance's Budget/Payroll Review/Expenses, Admin's Projects/Documents/Activity Logs/Security/Roles & Permissions, the generic multi-role Workflows/Approvals engine, Tasks, and Issues.

Explicit "Coming Soon" placeholders in the code — don't route into these live:

Shared AI Insights, Reports, and Resources pages (used as PM's "Intelligence" tab group)
Finance's Impact Review (AI budget/timeline impact) — also has no sidebar link
PM's own AI Insights, Reports, and Resources pages
Small sections within otherwise-real pages: a "Coming soon" panel inside the Admin, Consultant, and Architect dashboards, and Admin Security's login/session-monitoring card
Sidebar routing (fixed): every entry in client/src/config/role-tab.ts now points at a route that exists. Architect's Designs link goes to /designs; Engineer's Technical Operations group (previously pointing at Finance's budget routes) now goes to /tasks, /issues, /projects and /documents; Finance's Budget Management group points at /budget and /expenses; HR gained Attendance, Payroll and Workforce Reports. Any URL with no route now renders a "Page not found" page instead of a blank screen, so a mistyped address mid-demo is recoverable.

Part 5 — If the panel asks "how does X talk to Y" technically
Every role interaction is a real foreign key or role check, not a UI trick. Examples you can cite directly: project_engineers table links PM's assignment action to Engineer accounts; workflow_stages.role gates who can call PATCH /workflows/:id/stages/:stageId/decision; issues requires site-personnel/engineer to create and project-manager/engineer to resolve; payroll generation requires human-resources while the review decision requires finance-manager (with an admin/super-admin override, matching the workflow-decision endpoint).
Admin/Super Admin have an override: the workflow-decision endpoint lets admin/super-admin decide any stage regardless of its assigned role — useful to mention as a deliberate escalation path, and useful to you if a demo account misbehaves live.
Type normalization happens once, at the repository layer: free-text backend fields (status, risk) are mapped to strict frontend types right where API data enters the app, not scattered across components.