// Covers the pure rules behind the Oct 1 ticket batch: project dates, workflow
// template authoring, requirement attachments, milestone→task due dates, the
// attendance sheet parsers and the password rule. No database access.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

import { createProjectSchema, updateProjectSchema } from "./project-validator.js";
import { createWorkflowTemplateSchema } from "./workflow-validators.js";
import { createRequirementSchema, updateRequirementSchema } from "./requirement-validators.js";
import { resetPasswordSchema } from "./auth-validators.js";
import { resolveDueDateAgainstMilestone } from "../tasks/service.js";
import { buildTemplate, parseDateCell, parseTimeCell } from "../attendance/import.js";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
const offset = (days: number) => {
  const d = new Date(`${today()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const baseProject = {
  name: "Westgate Tower",
  code: "WGT-1",
  pm: "Miguel Santos",
  plannedStartDate: offset(1),
  due: offset(30),
};

describe("project dates (Bug-006)", () => {
  test("a valid start/due pair passes", () => {
    assert.equal(createProjectSchema.safeParse(baseProject).success, true);
  });

  test("planned start date is required on create", () => {
    const { plannedStartDate: _omit, ...rest } = baseProject;
    assert.equal(createProjectSchema.safeParse(rest).success, false);
  });

  test("a past due date or start date is rejected", () => {
    assert.equal(createProjectSchema.safeParse({ ...baseProject, due: offset(-1), plannedStartDate: offset(-5) }).success, false);
    assert.equal(createProjectSchema.safeParse({ ...baseProject, plannedStartDate: offset(-1) }).success, false);
  });

  test("due before start is rejected", () => {
    const result = createProjectSchema.safeParse({ ...baseProject, plannedStartDate: offset(10), due: offset(5) });
    assert.equal(result.success, false);
  });

  test("today is allowed for both", () => {
    assert.equal(createProjectSchema.safeParse({ ...baseProject, plannedStartDate: today(), due: today() }).success, true);
  });

  test("an update may keep an already-past due date, but still can't put it before the start", () => {
    assert.equal(updateProjectSchema.safeParse({ description: "edited", due: offset(-40) }).success, true);
    assert.equal(updateProjectSchema.safeParse({ plannedStartDate: offset(10), due: offset(5) }).success, false);
  });

  test("project type must be one of the offered types", () => {
    assert.equal(createProjectSchema.safeParse({ ...baseProject, projectType: "Industrial" }).success, true);
    assert.equal(createProjectSchema.safeParse({ ...baseProject, projectType: "Spaceport" }).success, false);
  });
});

describe("workflow template rules (C2)", () => {
  const stage = (role: string, iconKey: string) => ({ role, roleLabel: role, iconKey });
  const template = (stages: ReturnType<typeof stage>[]) => ({
    name: "Test template",
    description: "desc",
    avgDurationHours: 24,
    defaultStages: stages,
  });

  test("a role-valid template passes", () => {
    const result = createWorkflowTemplateSchema.safeParse(
      template([stage("engineer", "FileSignature"), stage("finance-manager", "Wallet"), stage("project-manager", "ShieldCheck")]),
    );
    assert.equal(result.success, true);
  });

  test("the same role can't hold two stages", () => {
    const result = createWorkflowTemplateSchema.safeParse(
      template([stage("project-manager", "UserCheck"), stage("project-manager", "ShieldCheck")]),
    );
    assert.equal(result.success, false);
  });

  test("a step type is only assignable to the roles allowed to hold it", () => {
    assert.equal(createWorkflowTemplateSchema.safeParse(template([stage("architect", "Wallet"), stage("admin", "ShieldCheck")])).success, false);
    assert.equal(createWorkflowTemplateSchema.safeParse(template([stage("engineer", "ShieldCheck"), stage("admin", "ShieldCheck")])).success, false);
  });

  test("owner can't be assigned to a stage, and unknown step types are refused", () => {
    assert.equal(createWorkflowTemplateSchema.safeParse(template([stage("owner", "UserCheck"), stage("admin", "ShieldCheck")])).success, false);
    assert.equal(createWorkflowTemplateSchema.safeParse(template([stage("engineer", "Bogus"), stage("admin", "ShieldCheck")])).success, false);
  });

  test("at most 10 stages", () => {
    const roles = ["project-manager", "admin", "finance-manager", "human-resources", "architect", "engineer", "consultant", "site-personnel", "it-designer"];
    const result = createWorkflowTemplateSchema.safeParse(template(roles.map((r) => stage(r, "UserCheck")).concat(stage("x", "UserCheck"))));
    assert.equal(result.success, false);
  });
});

describe("requirement attachments (F1)", () => {
  const base = {
    title: "Curtain wall performance",
    project: "WGT-1",
    category: "Materials",
    description: "Thermal performance of the curtain wall",
    createdBy: "Paolo Mendoza",
  };
  const file = { url: "/uploads/generic/spec.pdf", filename: "spec.pdf", contentType: "application/pdf", sizeBytes: 10 };

  test("a draft without a file is rejected", () => {
    assert.equal(createRequirementSchema.safeParse(base).success, false);
    assert.equal(createRequirementSchema.safeParse({ ...base, attachments: [] }).success, false);
  });

  test("a draft with a stored file passes", () => {
    assert.equal(createRequirementSchema.safeParse({ ...base, attachments: [file] }).success, true);
    assert.equal(
      createRequirementSchema.safeParse({
        ...base,
        attachments: [{ ...file, url: "https://abc123.private.blob.vercel-storage.com/easyconstruct/1-spec.pdf" }],
      }).success,
      true,
    );
  });

  test("an arbitrary external link is not a stored file", () => {
    assert.equal(createRequirementSchema.safeParse({ ...base, attachments: [{ ...file, url: "https://evil.example/x.pdf" }] }).success, false);
  });

  test("a status-only update (submit) is allowed; clearing the files is not", () => {
    assert.equal(updateRequirementSchema.safeParse({ status: "Under Review" }).success, true);
    assert.equal(updateRequirementSchema.safeParse({ attachments: [] }).success, false);
  });
});

describe("milestone due date → task due date (Integration Bug-003)", () => {
  const milestone = { title: "Slab pour", estimatedCompletionDate: "2026-11-30" };

  test("a task with no due date inherits the milestone's", () => {
    assert.equal(resolveDueDateAgainstMilestone(undefined, milestone), "2026-11-30");
  });

  test("a task due on or before the milestone keeps its date", () => {
    assert.equal(resolveDueDateAgainstMilestone("2026-11-15", milestone), "2026-11-15");
    assert.equal(resolveDueDateAgainstMilestone("2026-11-30", milestone), "2026-11-30");
  });

  test("a task due after the milestone is refused", () => {
    assert.throws(() => resolveDueDateAgainstMilestone("2026-12-01", milestone), /later than the milestone/);
  });

  test("a milestone with no date imposes nothing", () => {
    assert.equal(resolveDueDateAgainstMilestone("2026-12-01", { title: "x", estimatedCompletionDate: null }), "2026-12-01");
  });
});

describe("attendance sheet parsing (E3)", () => {
  test("dates: ISO, US, Date cells and Excel serials", () => {
    assert.equal(parseDateCell("2026-09-30"), "2026-09-30");
    assert.equal(parseDateCell("9/30/2026"), "2026-09-30");
    assert.equal(parseDateCell(new Date(Date.UTC(2026, 8, 30))), "2026-09-30");
    assert.equal(parseDateCell(46295), "2026-09-30");
    assert.equal(parseDateCell("2026-02-30"), null);
    assert.equal(parseDateCell("tomorrow"), null);
    assert.equal(parseDateCell(null), null);
  });

  test("times: HH:MM, AM/PM, day fractions and time cells", () => {
    assert.equal(parseTimeCell("08:00"), "08:00");
    assert.equal(parseTimeCell("8:05"), "08:05");
    assert.equal(parseTimeCell("5:30 PM"), "17:30");
    assert.equal(parseTimeCell("12:00 AM"), "00:00");
    assert.equal(parseTimeCell(0.375), "09:00");
    assert.equal(parseTimeCell(new Date(Date.UTC(1899, 11, 30, 17, 30))), "17:30");
    assert.equal(parseTimeCell("25:00"), null);
    assert.equal(parseTimeCell("noon"), null);
  });

  test("the template is a real workbook with the headers the importer expects", async () => {
    const buffer = await buildTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet("Attendance");
    assert.ok(sheet);
    const headers = [1, 2, 3, 4, 5, 6].map((c) => String(sheet!.getRow(1).getCell(c).value));
    assert.deepEqual(headers, ["Worker ID", "Date", "Time In", "Time Out", "Status", "Remarks"]);
    assert.ok(workbook.getWorksheet("Instructions"));
  });
});

describe("password rule for reset (B1)", () => {
  test("needs 10+ chars, an uppercase letter and a number", () => {
    assert.equal(resetPasswordSchema.safeParse({ token: "t", password: "Demo@12345" }).success, true);
    assert.equal(resetPasswordSchema.safeParse({ token: "t", password: "short1A" }).success, false);
    assert.equal(resetPasswordSchema.safeParse({ token: "t", password: "alllowercase123" }).success, false);
    assert.equal(resetPasswordSchema.safeParse({ token: "t", password: "NoNumbersHereAtAll" }).success, false);
  });
});

describe("recovery email delivery (B1)", () => {
  test("with no Gmail credentials configured, sending fails loudly instead of pretending", async () => {
    const { env } = await import("../config/env.js");
    if (env.MAIL_USER && env.MAIL_APP_PASSWORD) return; // configured here — nothing to assert
    const { assertMailConfigured } = await import("../mail/mailer.js");
    assert.throws(() => assertMailConfigured(), (err: { code?: string; statusCode?: number }) =>
      err.code === "MAIL_NOT_CONFIGURED" && err.statusCode === 503);
  });
});
