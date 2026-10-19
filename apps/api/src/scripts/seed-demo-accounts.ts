import bcrypt from "bcryptjs";
import { eq, or } from "drizzle-orm";

import { db } from "../core/db/connection.js";
import { employees } from "../core/db/schema/employees.js";
import { projects } from "../core/db/schema/projects.js";
import { roles } from "../core/db/schema/roles.js";
import { users } from "../core/db/schema/users.js";
import { workflowTemplates } from "../core/db/schema/workflows.js";
import { refreshProjectProgress } from "../modules/projects/lifecycle/service.js";
import { assertDemoDatabase } from "./demo-guard.js";

const PASSWORD = "Demo@12345";

// The Owner's real mailbox — see the note in main() and auth/service.ts
// initiateOwnerRecovery, which mails the IT Designer recovery link here.
const OWNER_EMAIL = process.env.DEMO_OWNER_EMAIL?.trim() || "nhylcyrusgervasio@gmail.com";

const ACCOUNTS = [
  // NOTE: the legacy platform-admin role was renamed/merged into IT Designer
  // — its old demo account (superadmin@easyconstruct.demo) is intentionally
  // gone. Every grant it held now belongs to it-designer below.
  { name: "Dana Reyes", email: "admin@easyconstruct.demo", role: "admin", employeeRole: "Admin", department: "Administration" },
  { name: "Miguel Santos", email: "pm@easyconstruct.demo", role: "project-manager", employeeRole: "Project Manager", department: "Project Management" },
  { name: "Liza Torres", email: "hr@easyconstruct.demo", role: "human-resources", employeeRole: "HR Officer", department: "Human Resources" },
  { name: "Carlo Ramos", email: "finance@easyconstruct.demo", role: "finance-manager", employeeRole: "Finance Manager", department: "Finance" },
  { name: "Ana Villanueva", email: "architect@easyconstruct.demo", role: "architect", employeeRole: "Architect", department: "Design" },
  { name: "Paolo Mendoza", email: "engineer@easyconstruct.demo", role: "engineer", employeeRole: "Site Engineer", department: "Engineering" },
  { name: "Rico Domingo", email: "site@easyconstruct.demo", role: "site-personnel", employeeRole: "Construction Worker", department: "Field Operations" },
  { name: "Elena Bautista", email: "consultant@easyconstruct.demo", role: "consultant", employeeRole: "Consultant", department: "Advisory" },
  { name: "Teresa Aquino", email: OWNER_EMAIL, role: "owner", employeeRole: "Owner", department: "Executive" },
  { name: "Noel Garcia", email: "itdesigner@easyconstruct.demo", role: "it-designer", employeeRole: "IT Designer", department: "Information Technology" },
] as const;

// One row per role — the label/employeeRole/department a generated
// "<role-slug><n>@easyconstruct.demo" account below is built from. Must match
// the role strings requireRole() checks compare against (apps/api/src/**/routes.ts),
// not a display label.
const ROLE_DEFS = [
  { role: "admin", label: "Admin", employeeRole: "Admin", department: "Administration" },
  { role: "it-designer", label: "IT Designer", employeeRole: "IT Designer", department: "Information Technology" },
  { role: "owner", label: "Owner", employeeRole: "Owner", department: "Executive" },
  { role: "project-manager", label: "Project Manager", employeeRole: "Project Manager", department: "Project Management" },
  { role: "architect", label: "Architect", employeeRole: "Architect", department: "Design" },
  { role: "engineer", label: "Engineer", employeeRole: "Site Engineer", department: "Engineering" },
  { role: "consultant", label: "Consultant", employeeRole: "Consultant", department: "Advisory" },
  { role: "finance-manager", label: "Finance Manager", employeeRole: "Finance Manager", department: "Finance" },
  { role: "human-resources", label: "Human Resources", employeeRole: "HR Officer", department: "Human Resources" },
  { role: "site-personnel", label: "Site Personnel", employeeRole: "Construction Worker", department: "Field Operations" },
] as const;

// Q6: every demo employee was seeded with payRate defaulting to 0 (its
// column default — see apps/api/src/db/schema/employees.ts), so any payroll
// batch generated against them computed gross/deductions/net as ₱0 no
// matter how many hours were entered — from Finance's payroll review
// screen, every batch looked identically uncomputed. Rough PHP figures,
// keyed by the same `employeeRole` string every account already carries.
const PAY_RATE_BY_ROLE: Record<string, { payRate: string; rateType: "Hourly" | "Daily" | "Monthly" }> = {
  Admin: { payRate: "45000", rateType: "Monthly" },
  "Project Manager": { payRate: "65000", rateType: "Monthly" },
  "HR Officer": { payRate: "35000", rateType: "Monthly" },
  "Finance Manager": { payRate: "55000", rateType: "Monthly" },
  Architect: { payRate: "50000", rateType: "Monthly" },
  "Site Engineer": { payRate: "45000", rateType: "Monthly" },
  "Construction Worker": { payRate: "150", rateType: "Hourly" },
  Consultant: { payRate: "800", rateType: "Hourly" },
  Owner: { payRate: "0", rateType: "Monthly" }, // not on payroll
  "IT Designer": { payRate: "48000", rateType: "Monthly" },
};
const DEFAULT_PAY_RATE = { payRate: "30000", rateType: "Monthly" as const };

// ── Part E: 100-employee roster ─────────────────────────────────────────
// The 50 demo-account employees above all have a `users` login. These are
// roster-only (employees.userId stays null — nullable per the schema) real
// construction trade rows so HR's dashboards have a realistic org to
// summarize, not just the 10 canonical role logins ×5. Upserted on
// `employeeId` (ROSTER-001..050), so re-running seed-demo-accounts.ts never
// duplicates them.
const ROSTER_FIRST_NAMES = [
  "Jose", "Juan", "Antonio", "Ramon", "Ricardo", "Eduardo", "Roberto", "Manuel",
  "Fernando", "Alfredo", "Danilo", "Rodrigo", "Ernesto", "Arnel", "Bienvenido",
  "Rogelio", "Wilfredo", "Reynaldo", "Melchor", "Efren", "Maria", "Carmen",
  "Rosario", "Corazon", "Imelda", "Josefina", "Remedios", "Consolacion",
  "Leonora", "Estrella", "Divina", "Angelica", "Marites", "Grace", "Joy",
  "Cristina", "Perla", "Lourdes", "Rowena", "Susan",
] as const;
const ROSTER_LAST_NAMES = [
  "Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Garcia", "Mendoza",
  "Torres", "Flores", "Ramos", "Villanueva", "Castro", "Aquino", "Del Rosario",
  "Gonzales", "Manalo", "Fernandez", "Pascual", "Salazar", "Navarro",
  "Domingo", "Rivera", "Marasigan", "Concepcion", "Ignacio", "Lazaro",
  "Panganiban", "Espiritu", "Umali", "Bernardo",
] as const;

// (label, department, hourly/daily payRate+rateType, rateType). Real
// Philippine construction trade titles, pay bands consistent with
// ph-statutory.ts's deduction bands (which apply to `gross`, computed from
// these — hourly rows land well within the SSS/PhilHealth/Pag-IBIG
// contribution schedule's normal salary-credit range once annualized).
const TRADE_DEFS: { role: string; department: string; payRate: string; rateType: "Hourly" | "Daily" | "Monthly" }[] = [
  { role: "Mason", department: "Field Operations", payRate: "130", rateType: "Hourly" },
  { role: "Carpenter", department: "Field Operations", payRate: "125", rateType: "Hourly" },
  { role: "Steel Fixer / Rebar Worker", department: "Field Operations", payRate: "135", rateType: "Hourly" },
  { role: "Electrician", department: "Field Operations", payRate: "165", rateType: "Hourly" },
  { role: "Plumber", department: "Field Operations", payRate: "150", rateType: "Hourly" },
  { role: "Welder", department: "Field Operations", payRate: "160", rateType: "Hourly" },
  { role: "Painter", department: "Field Operations", payRate: "115", rateType: "Hourly" },
  { role: "Heavy Equipment Operator", department: "Field Operations", payRate: "1200", rateType: "Daily" },
  { role: "Foreman", department: "Field Operations", payRate: "1450", rateType: "Daily" },
  { role: "Safety Officer", department: "Field Operations", payRate: "28000", rateType: "Monthly" },
  { role: "Surveyor", department: "Engineering", payRate: "32000", rateType: "Monthly" },
  { role: "Draftsman", department: "Design", payRate: "24000", rateType: "Monthly" },
  { role: "Warehouseman", department: "Field Operations", payRate: "850", rateType: "Daily" },
  { role: "Site Clerk", department: "Project Management", payRate: "20000", rateType: "Monthly" },
  { role: "Laborer", department: "Field Operations", payRate: "645", rateType: "Daily" },
];

const ROSTER_STATUSES = ["Active", "Active", "Active", "Active", "On Leave", "Inactive"] as const;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Real, stable per-employee variance (deterministic seed so repeated runs
// produce identical rows for the same index — a real requirement for
// upsert idempotency, not just aesthetic reproducibility).
function buildRosterEmployees(count: number, siteNames: readonly string[]) {
  const rand = mulberry32(20260925);
  const rows: {
    employeeId: string;
    name: string;
    initials: string;
    role: string;
    department: string;
    site: string;
    status: string;
    attendanceRate: number;
    performance: string;
    hiredOn: string;
    payRate: string;
    rateType: "Hourly" | "Daily" | "Monthly";
  }[] = [];
  for (let i = 0; i < count; i++) {
    const first = ROSTER_FIRST_NAMES[Math.floor(rand() * ROSTER_FIRST_NAMES.length)]!;
    const last = ROSTER_LAST_NAMES[Math.floor(rand() * ROSTER_LAST_NAMES.length)]!;
    const trade = TRADE_DEFS[Math.floor(rand() * TRADE_DEFS.length)]!;
    const site = siteNames[Math.floor(rand() * siteNames.length)]!;
    const status = ROSTER_STATUSES[Math.floor(rand() * ROSTER_STATUSES.length)]!;
    // Real variance, not a uniform value: attendance 72-100%, performance
    // 2.8-5.0, hire dates spread across the last 6 years.
    const attendanceRate = 72 + Math.floor(rand() * 29);
    const performance = (2.8 + rand() * 2.2).toFixed(1);
    const hireDaysAgo = Math.floor(rand() * 6 * 365);
    const hiredOn = new Date(Date.now() - hireDaysAgo * 86400000).toISOString().slice(0, 10);
    const name = `${first} ${last}`;
    rows.push({
      employeeId: `EMP-ROSTER-${String(i + 1).padStart(3, "0")}`,
      name,
      initials: initials(name),
      role: trade.role,
      department: trade.department,
      site,
      status,
      attendanceRate,
      performance,
      hiredOn,
      payRate: trade.payRate,
      rateType: trade.rateType,
    });
  }
  return rows;
}

const ORDINAL_NAME = ["One", "Two", "Three", "Four"] as const;

// 4 accounts per role, email "<role-slug-without-hyphens><n>@easyconstruct.demo"
// (e.g. sitepersonnel1@easyconstruct.demo) — required by the demo seeding spec
// so every role can be exercised from a predictable, discoverable login set,
// independent of the hand-named ACCOUNTS above.
//
// B1: "owner" is deliberately excluded here — EasyConstruct allows exactly
// one master Owner account (users/service.ts assertOwnerSlotAvailable, plus
// a DB-level partial unique index), and the hand-named owner@easyconstruct.demo
// in ACCOUNTS above already occupies that single slot. Generating owner1..4
// on top of it would violate the very constraint this seed data is supposed
// to be a working example of.
const GENERATED_ACCOUNTS = ROLE_DEFS.filter((def) => def.role !== "owner").flatMap((def) => {
  const emailSlug = def.role.replace(/-/g, "");
  return ORDINAL_NAME.map((ordinal, i) => ({
    name: `${def.label} ${ordinal}`,
    email: `${emailSlug}${i + 1}@easyconstruct.demo`,
    role: def.role,
    employeeRole: def.employeeRole,
    department: def.department,
  }));
});

// Backs Admin's read-only Roles & Permissions screen. `name` must match the
// role string stored on users.role, since that's what every requireRole()
// check on the backend compares against.
const ROLES = [
  { name: "admin", label: "Admin", description: "Org-wide oversight: projects, workflows, documents, audit trail, and security." },
  { name: "project-manager", label: "Project Manager", description: "Creates projects, assigns engineers, initiates workflows, and signs off on approvals." },
  { name: "human-resources", label: "Human Resources", description: "Employee roster, attendance verification, and payroll generation." },
  { name: "finance-manager", label: "Finance Manager", description: "Budgets, expenses, and payroll batch review and approval." },
  { name: "architect", label: "Architect", description: "Designs, blueprints, proposals, reviews, and revisions." },
  { name: "engineer", label: "Engineer", description: "Technical requirements, progress reports, task creation, and issue resolution." },
  { name: "site-personnel", label: "Site Personnel", description: "Geofenced attendance, field task updates, documents, and issue reporting." },
  { name: "consultant", label: "Consultant", description: "Advisory review of design proposals and advisory documentation." },
  { name: "owner", label: "Owner", description: "Executive read-only oversight: org-wide performance, audit trail, and system activity." },
  { name: "it-designer", label: "IT Designer", description: "Platform administration: user accounts, roles, system configuration, monitoring, and maintenance." },
] as const;

const TEMPLATES = [
  {
    name: "Design Proposal Approval",
    description: "Architect submits a design; Consultant reviews it; PM signs off.",
    avgDurationHours: "48.0",
    defaultStages: [
      { role: "architect", roleLabel: "Architect Submission", iconKey: "FileSignature" },
      { role: "consultant", roleLabel: "Consultant Review", iconKey: "UserCheck" },
      { role: "project-manager", roleLabel: "PM Approval", iconKey: "ShieldCheck" },
    ],
  },
  {
    name: "Budget Change Request",
    description: "Engineer justifies a change; Finance reviews cost impact; PM and Admin sign off.",
    avgDurationHours: "72.0",
    defaultStages: [
      { role: "engineer", roleLabel: "Engineer Justification", iconKey: "FileSignature" },
      { role: "finance-manager", roleLabel: "Finance Review", iconKey: "Wallet" },
      { role: "project-manager", roleLabel: "PM Sign-off", iconKey: "ShieldCheck" },
      { role: "admin", roleLabel: "Admin Final Approval", iconKey: "ShieldCheck" },
    ],
  },
  // EC-010: previously lived outside this script (seeded manually, id 3),
  // so a full db:reset silently lost it — every fresh database had only the
  // two templates above. Seeded here now so it's a real default like them.
  // Stage sequence per docs/issues-list.md EC-010: HR Verification → Project
  // Manager → Admin Sign-off.
  {
    name: "Subcontractor onboarding",
    description: "HR verifies a subcontractor's documentation; PM and Admin sign off on engagement.",
    avgDurationHours: "36.0",
    defaultStages: [
      { role: "human-resources", roleLabel: "HR Verification", iconKey: "UserCheck" },
      { role: "project-manager", roleLabel: "Project Manager", iconKey: "FileSignature" },
      { role: "admin", roleLabel: "Admin Sign-off", iconKey: "ShieldCheck" },
    ],
  },
  // Name must be exactly "Public works compliance" — it's matched by string
  // (see apps/web/src/components/workflows/workflow-initiation-actions.tsx's
  // PUBLIC_WORKS_COMPLIANCE_ACTION and the "only" filters on
  // architect-proposals.tsx / architect-reviews.tsx). A prior manually-
  // created row here was named "Public work compliance" (no "s"), which
  // matched none of those lookups and produced "No 'Public works compliance'
  // workflow template is configured."
  {
    name: "Public works compliance",
    description: "Architect review for a public-sector project; PM, Finance and Admin sign off.",
    avgDurationHours: "34.0",
    defaultStages: [
      { role: "architect", roleLabel: "Architect Review", iconKey: "FileSignature" },
      { role: "project-manager", roleLabel: "Project Manager", iconKey: "UserCheck" },
      { role: "finance-manager", roleLabel: "Finance Manager", iconKey: "Wallet" },
      { role: "admin", roleLabel: "Admin", iconKey: "ShieldCheck" },
    ],
  },
  // New: gives Consultant an initiation action of its own — it could already
  // decide on a stage (Design Proposal Approval's Consultant Review) and the
  // route already permits it to initiate (canInitiateWorkflow in
  // workflows/routes.ts), but no template ever put a Consultant-owned stage
  // first, so WORKFLOW_ACTIONS_BY_ROLE had no entry for it and the role had
  // no "start a workflow" button anywhere in the app.
  {
    name: "Document Compliance Review",
    description: "Consultant flags an advisory document for compliance review; Architect and Admin sign off.",
    avgDurationHours: "40.0",
    defaultStages: [
      { role: "consultant", roleLabel: "Consultant Review", iconKey: "UserCheck" },
      { role: "architect", roleLabel: "Architect Sign-off", iconKey: "FileSignature" },
      { role: "admin", roleLabel: "Admin Sign-off", iconKey: "ShieldCheck" },
    ],
  },
  // New: a PM-initiated chain distinct from Budget Change Request (which is
  // Engineer-initiated and framed as a cost justification) — this is a
  // scope/schedule change the PM raises directly, with Engineer weighing the
  // technical impact before Finance and Admin sign off on the cost.
  {
    name: "Change Order Request",
    description: "PM raises a scope or schedule change; Engineer assesses impact; Finance and Admin sign off.",
    avgDurationHours: "60.0",
    defaultStages: [
      { role: "project-manager", roleLabel: "PM Request", iconKey: "FileSignature" },
      { role: "engineer", roleLabel: "Engineer Impact Review", iconKey: "UserCheck" },
      { role: "finance-manager", roleLabel: "Finance Review", iconKey: "Wallet" },
      { role: "admin", roleLabel: "Admin Sign-off", iconKey: "ShieldCheck" },
    ],
  },
  // H3: name must be exactly "Project Closeout" — matched by string in
  // lifecycle/repository.ts's CLOSEOUT_TEMPLATE_NAME (gate X4 reads
  // closeoutTemplateId from this lookup) and in workflows/service.ts's
  // phase/role restriction on who may start one. Engineer initiates (the
  // Final Inspection is theirs, gate X1); Finance's stage is where H4 blocks
  // on pending expenses; PM and Admin sign off last.
  {
    name: "Project Closeout",
    description: "Engineer confirms final inspection; Finance clears outstanding expenses; PM and Admin sign off to complete the project.",
    avgDurationHours: "72.0",
    defaultStages: [
      { role: "engineer", roleLabel: "Final Inspection Sign-off", iconKey: "FileSignature" },
      { role: "finance-manager", roleLabel: "Finance Closeout Review", iconKey: "Wallet" },
      { role: "project-manager", roleLabel: "PM Sign-off", iconKey: "ShieldCheck" },
      { role: "admin", roleLabel: "Admin Final Approval", iconKey: "ShieldCheck" },
    ],
  },
  // Design delivery projects: the turnover of the plan sets to the client.
  // Name must be exactly "Design Turnover" — matched by string in lifecycle/delivery.ts.
  {
    name: "Design Turnover",
    description: "Architect hands over the plan sets; Consultant reviews; PM and Admin sign off the turnover to the client.",
    avgDurationHours: "60.0",
    defaultStages: [
      { role: "architect", roleLabel: "Architect Handover", iconKey: "FileSignature" },
      { role: "consultant", roleLabel: "Consultant Review", iconKey: "UserCheck" },
      { role: "project-manager", roleLabel: "PM Sign-off", iconKey: "ShieldCheck" },
      { role: "admin", roleLabel: "Admin Final Approval", iconKey: "ShieldCheck" },
    ],
  },
] as const;

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const ALL_ACCOUNTS = [...ACCOUNTS, ...GENERATED_ACCOUNTS];

async function main() {
  assertDemoDatabase();
  const password = await bcrypt.hash(PASSWORD, 10);
  let createdUsers = 0;
  let createdEmployees = 0;

  await db.transaction(async (tx) => {
    // The Owner's registered email is a real inbox (fail-safe recovery mails
    // its reset link there). Seeding is keyed on email, so an Owner created
    // by an older run under owner@easyconstruct.demo would otherwise be left
    // in place and a SECOND owner inserted — which the single-Owner unique
    // index rejects. Move the existing row over instead.
    const [existingOwner] = await tx.select().from(users).where(eq(users.role, "owner"));
    if (existingOwner && existingOwner.email !== OWNER_EMAIL) {
      await tx.update(users).set({ email: OWNER_EMAIL, updatedAt: new Date() }).where(eq(users.id, existingOwner.id));
      await tx.update(employees).set({ email: OWNER_EMAIL, updatedAt: new Date() }).where(eq(employees.userId, existingOwner.id));
      console.log(`moved owner email: ${existingOwner.email} -> ${OWNER_EMAIL}`);
    }

    for (const [index, account] of ALL_ACCOUNTS.entries()) {
      let [user] = await tx
        .select()
        .from(users)
        .where(eq(users.email, account.email));

      if (!user) {
        [user] = await tx
          .insert(users)
          .values({
            name: account.name,
            email: account.email,
            password,
            role: account.role,
          })
          .returning();
        createdUsers++;
        console.log(`created user: ${account.email}`);
      } else {
        console.log(`skip user (exists): ${account.email}`);
      }

      if (!user) throw new Error(`Failed to create or find ${account.email}`);

      const [employee] = await tx
        .select()
        .from(employees)
        .where(
          or(
            eq(employees.userId, user.id),
            eq(employees.email, account.email),
          ),
        );

      if (employee) {
        if (employee.userId !== user.id) {
          await tx
            .update(employees)
            .set({ userId: user.id, updatedAt: new Date() })
            .where(eq(employees.id, employee.id));
        }
        console.log(`skip employee (exists): ${account.email}`);
        continue;
      }

      const pay = PAY_RATE_BY_ROLE[account.employeeRole] ?? DEFAULT_PAY_RATE;
      await tx.insert(employees).values({
        employeeId: `EMP-DEMO-${String(index + 1).padStart(2, "0")}`,
        name: account.name,
        initials: initials(account.name),
        role: account.employeeRole,
        department: account.department,
        site: "Main Site",
        hiredOn: new Date().toISOString().slice(0, 10),
        email: account.email,
        userId: user.id,
        payRate: pay.payRate,
        rateType: pay.rateType,
      });
      createdEmployees++;
      console.log(`created employee: ${account.email}`);
    }

    // Part E1: 50 roster-only employees (userId stays null — no login),
    // spread across the real demo projects' display names so E3's
    // useWorkforceSnapshot() per-site rollup has more than one bucket.
    // Upserted on employeeId: a row that already exists is updated in
    // place (same values, since the generator is deterministic) rather
    // than re-inserted, so re-running this script never duplicates rows.
    const demoProjects = await tx.select({ name: projects.name }).from(projects);
    const siteNames = demoProjects.length > 0
      ? demoProjects.map((p) => p.name)
      : ["Main Office"];
    const rosterRows = buildRosterEmployees(50, siteNames);
    for (const row of rosterRows) {
      const [existing] = await tx
        .select()
        .from(employees)
        .where(eq(employees.employeeId, row.employeeId));
      if (existing) {
        await tx
          .update(employees)
          .set({ ...row, updatedAt: new Date() })
          .where(eq(employees.id, existing.id));
        console.log(`updated roster employee: ${row.employeeId}`);
      } else {
        await tx.insert(employees).values(row);
        createdEmployees++;
        console.log(`created roster employee: ${row.employeeId}`);
      }
    }

    for (const role of ROLES) {
      const [existing] = await tx
        .select()
        .from(roles)
        .where(eq(roles.name, role.name));

      if (existing) {
        console.log(`skip role (exists): ${role.name}`);
        continue;
      }

      await tx.insert(roles).values(role);
      console.log(`created role: ${role.name}`);
    }

    for (const template of TEMPLATES) {
      const [existing] = await tx
        .select()
        .from(workflowTemplates)
        .where(eq(workflowTemplates.name, template.name));

      if (existing) {
        console.log(`skip workflow template (exists): ${template.name}`);
        continue;
      }

      await tx.insert(workflowTemplates).values({
        ...template,
        defaultStages: template.defaultStages.map((s) => ({ ...s })),
      });
      console.log(`created workflow template: ${template.name}`);
    }
  });

  console.log(`\nDone. Created ${createdUsers} users and ${createdEmployees} employees (${ALL_ACCOUNTS.length} accounts total).`);
  console.log(`Password for demo accounts: ${PASSWORD}`);

  // Every demo login, printed together so the two newest roles (owner,
  // it-designer) are as easy to find as the nine that predate them.
  console.log("\nDemo logins:");
  for (const account of ALL_ACCOUNTS) {
    console.log(`  ${account.role.padEnd(16)} ${account.email}`);
  }

  // L1: D-7's status migration (ensure-demo-schema.ts) rewrites free-text
  // statuses to real phase names but can't recompute progress itself — the
  // lifecycle service (gates, bands) it needs doesn't exist at that layer.
  // Every project's progress is recomputed here instead, once the lifecycle
  // service is actually importable, so a fresh seed never leaves a project
  // with a phase/progress mismatch.
  const allProjects = await db.select({ code: projects.code }).from(projects);
  for (const project of allProjects) {
    await refreshProjectProgress(project.code);
  }
  console.log(`\nRecomputed lifecycle progress for ${allProjects.length} project(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
