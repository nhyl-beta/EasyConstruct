// apps/api/src/modules/design/transmittals/issue-email.db-test.ts
//
// Real-database test (npm run test:db): issuing a transmittal whose "To" is
// email-shaped tries to mail it and records the outcome; a plain office/
// person name is left untouched. Either way issuing itself never throws —
// mail being unconfigured (as it is in CI) must fail the send, not the
// request. Fixtures are committed under a throwaway project code and
// removed again in after().
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { projects } from "../../../core/db/schema/projects.js";
import { projectMembers } from "../../../core/db/schema/project-members.js";
import { users } from "../../../core/db/schema/users.js";
import { transmittals, transmittalItems } from "../../../core/db/schema/design-requests.js";
import { assertDemoDatabase } from "../../../../scripts/demo/demo-guard.js";
import { create, issue } from "./service.js";
import type { Actor } from "./service.js";

const tag = `DBT${Date.now().toString(36)}`;
const P = `ZZ-${tag}`;

let pm: Actor;

describe("issuing a transmittal: whether it tries to email it", () => {
  before(async () => {
    assertDemoDatabase();
    const [u] = await db
      .insert(users)
      .values({ name: "Test PM", email: `${tag}@test.local`, password: "x", role: "project-manager" })
      .returning({ id: users.id, name: users.name, role: users.role });
    pm = { id: u!.id, name: u!.name, role: u!.role };

    await db.insert(projects).values({ name: "Transmittal email test", code: P, pm: pm.name, due: "2099-12-31", status: "Construction" });
    await db.insert(projectMembers).values({ projectCode: P, userId: pm.id, userName: pm.name, role: "project-manager", addedBy: "test" });
  });

  after(async () => {
    const rows = await db.select({ id: transmittals.id }).from(transmittals).where(eq(transmittals.projectCode, P));
    for (const r of rows) await db.delete(transmittalItems).where(eq(transmittalItems.transmittalId, r.id));
    await db.delete(transmittals).where(eq(transmittals.projectCode, P));
    await db.delete(projectMembers).where(eq(projectMembers.projectCode, P));
    await db.delete(projects).where(eq(projects.code, P));
    await db.delete(users).where(eq(users.id, pm.id));
  });

  test("an email-shaped 'To' gets an emailStatus after issuing, and issuing never throws", async () => {
    const created = await create(
      {
        projectCode: P,
        toName: "site-engineer@example.com",
        subject: "Shop drawings for review",
        type: "inter-office" as const,
        purposes: ["for-information"] as const,
        items: [{ particulars: "Structural plan Rev. B" }],
      } as Parameters<typeof create>[0],
      pm,
    );

    const issued = await issue(created.id, pm);
    assert.equal(issued.status, "issued");
    // Mail is unconfigured in this environment, so the send fails — but it
    // must fail *the send*, not the request: issuing still succeeds and
    // reports it.
    assert.equal(issued.emailStatus, "failed");
  });

  test("a plain office name is left alone — no email attempted", async () => {
    const created = await create(
      {
        projectCode: P,
        toName: "Site Engineer's Office",
        subject: "Shop drawings for review",
        type: "inter-office" as const,
        purposes: ["for-information"] as const,
        items: [{ particulars: "Structural plan Rev. B" }],
      } as Parameters<typeof create>[0],
      pm,
    );

    const issued = await issue(created.id, pm);
    assert.equal(issued.status, "issued");
    assert.equal(issued.emailStatus, null);
  });
});
