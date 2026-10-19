import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  assertStakeholderRole,
  canSeeContactDetails,
  forViewer,
  isValidEmail,
  planBackfill,
  primaryOwner,
  projectFieldsFromOwner,
  type StakeholderRow,
} from "./rules.js";

const row = (over: Partial<StakeholderRow> = {}): StakeholderRow => ({
  id: 1,
  projectCode: "P1",
  name: "Ana Cruz",
  company: "Cruz Holdings",
  role: "Owner",
  email: "ana@cruz.example",
  phone: "0917 000 0000",
  ...over,
});

describe("role validation", () => {
  test("Owner, Contractor and Other are accepted", () => {
    for (const r of ["Owner", "Contractor", "Other"]) assert.equal(assertStakeholderRole(r), r);
  });
  test("anything else is refused", () => {
    assert.throws(() => assertStakeholderRole("Supplier"), /Role must be one of/);
    assert.throws(() => assertStakeholderRole("owner"), /Role must be one of/);
    assert.throws(() => assertStakeholderRole(undefined), /Role must be one of/);
  });
});

describe("email check", () => {
  test("accepts normal addresses and rejects obvious mistakes", () => {
    assert.ok(isValidEmail("a@b.co"));
    assert.ok(isValidEmail(" ana@cruz.example "));
    for (const bad of ["", "ana", "ana@", "@cruz.example", "ana@cruz", "a b@c.de"]) assert.equal(isValidEmail(bad), false, bad);
  });
});

describe("who sees contact details", () => {
  test("only the PM and Admin see emails and phones", () => {
    assert.equal(canSeeContactDetails("admin"), true);
    assert.equal(canSeeContactDetails("project-manager"), true);
    for (const role of ["engineer", "architect", "consultant", "site-personnel", "finance-manager", "human-resources", "owner", "it-designer"]) {
      assert.equal(canSeeContactDetails(role), false, role);
    }
  });
  test("a staffed role gets name and company but no email or phone", () => {
    const seen = forViewer(row(), "engineer");
    assert.equal(seen.name, "Ana Cruz");
    assert.equal(seen.company, "Cruz Holdings");
    assert.equal(seen.email, null);
    assert.equal(seen.phone, null);
    assert.equal(seen.hasEmail, true);
    assert.equal(seen.contactHidden, true);
  });
  test("the PM sees everything", () => {
    const seen = forViewer(row(), "project-manager");
    assert.equal(seen.email, "ana@cruz.example");
    assert.equal(seen.phone, "0917 000 0000");
    assert.equal(seen.contactHidden, false);
  });
});

describe("keeping projects.client in step with the first Owner", () => {
  test("the first Owner by id wins; Contractors never do", () => {
    const rows = [row({ id: 5, role: "Contractor" }), row({ id: 9, name: "Second" }), row({ id: 3, name: "First" })];
    assert.equal(primaryOwner(rows)?.name, "First");
    assert.equal(primaryOwner([row({ role: "Contractor" })]), undefined);
  });
  test("client is the company, else the name; the email is lower-cased", () => {
    assert.deepEqual(projectFieldsFromOwner(row({ email: "ANA@Cruz.Example" })), { client: "Cruz Holdings", clientEmail: "ana@cruz.example" });
    assert.deepEqual(projectFieldsFromOwner(row({ company: null, email: null })), { client: "Ana Cruz", clientEmail: null });
  });
});

describe("backfill plan", () => {
  const projects = [
    { code: "A", client: "Acme Corp", clientEmail: "ops@acme.example" },
    { code: "B", client: "Beta Ltd", clientEmail: null },
    { code: "C", client: null, clientEmail: "c@c.example" },
    { code: "D", client: "  ", clientEmail: "" },
    { code: "E", client: "Echo Inc", clientEmail: "e@e.example" },
  ];

  test("one Owner row for each project with a client name or email and no Owner yet", () => {
    const plan = planBackfill(projects, new Set(["E"]));
    assert.deepEqual(plan.map((p) => p.projectCode), ["A", "B", "C"]);
    assert.equal(plan[0]!.company, "Acme Corp");
    assert.equal(plan[2]!.name, "c@c.example");
    assert.ok(plan.every((p) => p.role === "Owner"));
  });

  test("running it again after applying finds nothing to add (idempotent)", () => {
    const first = planBackfill(projects, new Set());
    const second = planBackfill(projects, new Set(first.map((p) => p.projectCode)));
    assert.deepEqual(second, []);
  });
});
