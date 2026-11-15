// apps/api/src/modules/projects/revisions/revision-routing.db-test.ts
//
// Real-database test (npm run test:db): submitting a revision through the
// one endpoint the UI actually uses (POST /revisions) for a design or
// blueprint that a consultant sent back must put it in front of the
// consultant again — a design reopens to "Under Review" with a fresh
// design-review queued, a blueprint's `approval` resets off Rejected. Fixtures
// are committed under a throwaway project code and removed again in after().
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { projects } from "../../../core/db/schema/projects.js";
import { projectMembers } from "../../../core/db/schema/project-members.js";
import { users } from "../../../core/db/schema/users.js";
import { designs } from "../../../core/db/schema/designs.js";
import { designReviews } from "../../../core/db/schema/design-reviews.js";
import { blueprints } from "../../../core/db/schema/blueprints.js";
import { revisions } from "../../../core/db/schema/revisions.js";
import { assertDemoDatabase } from "../../../../scripts/demo/demo-guard.js";
import { create as createRevision } from "./service.js";
import * as designReviewsRepo from "../../design/designs/design-reviews/repository.js";
import { decide as decideBlueprint } from "../../design/blueprints/service.js";
import type { RevisionActor } from "./types.js";

const tag = `DBR${Date.now().toString(36)}`;
const P = `ZZ-${tag}`;
const FILE = { url: "/uploads/generic/x.pdf", fileName: "fix.pdf", fileSize: 1024, mimeType: "application/pdf" };

let architect: RevisionActor;
let designId: number;
let blueprintId: number;

describe("revision routing back to the consultant", () => {
  before(async () => {
    assertDemoDatabase();
    const [u] = await db
      .insert(users)
      .values({ name: "Test Architect", email: `${tag}@test.local`, password: "x", role: "architect" })
      .returning({ id: users.id, name: users.name, role: users.role });
    architect = { id: u!.id, name: u!.name, role: u!.role };

    await db.insert(projects).values({ name: "Revision routing test", code: P, pm: "Test PM", due: "2099-12-31", status: "Construction" });
    await db.insert(projectMembers).values({ projectCode: P, userId: architect.id, userName: architect.name, role: "architect", addedBy: "test" });

    const [d] = await db
      .insert(designs)
      .values({ code: `DSN-${tag}`, name: "Test design", projectCode: P, discipline: "Architectural", category: "Floor Plan", leadArchitect: architect.name, status: "Revision Required" })
      .returning({ id: designs.id });
    designId = d!.id;

    const [b] = await db
      .insert(blueprints)
      .values({ drawingNumber: `B-${tag}`, title: "Test blueprint", folder: "General", author: architect.name, projectCode: P, approval: "Rejected", status: "Current" })
      .returning({ id: blueprints.id });
    blueprintId = b!.id;
  });

  after(async () => {
    await db.delete(revisions).where(eq(revisions.projectCode, P));
    await db.delete(blueprints).where(eq(blueprints.id, blueprintId));
    await db.delete(designReviews).where(eq(designReviews.designId, designId));
    await db.delete(designs).where(eq(designs.id, designId));
    await db.delete(projectMembers).where(eq(projectMembers.projectCode, P));
    await db.delete(projects).where(eq(projects.code, P));
    await db.delete(users).where(eq(users.id, architect.id));
  });

  test("a revision on a Revision Required design reopens it and queues a new review", async () => {
    await createRevision({ projectCode: P, itemType: "design", itemId: designId, changeSummary: "Addressed the comments", file: FILE }, architect);

    const [reopened] = await db.select({ status: designs.status }).from(designs).where(eq(designs.id, designId));
    assert.equal(reopened?.status, "Under Review");

    const reviews = await designReviewsRepo.findAll({ designId });
    assert.equal(reviews.length, 1);
    assert.equal(reviews[0]!.status, "Pending");
  });

  test("a revision on a Rejected blueprint resets approval so it reappears in the Pending queue", async () => {
    await createRevision({ projectCode: P, itemType: "blueprint", itemId: blueprintId, changeSummary: "Reworked the detail", file: FILE }, architect);

    const [updated] = await db.select({ approval: blueprints.approval }).from(blueprints).where(eq(blueprints.id, blueprintId));
    assert.equal(updated?.approval, "Pending");
  });

  test("a revision on a design that is not in a revision state leaves its status alone", async () => {
    await db.update(designs).set({ status: "Draft" }).where(eq(designs.id, designId));
    await createRevision({ projectCode: P, itemType: "design", itemId: designId, changeSummary: "First cut", file: FILE }, architect);

    const [untouched] = await db.select({ status: designs.status }).from(designs).where(eq(designs.id, designId));
    assert.equal(untouched?.status, "Draft");
  });

  test("blueprint decide(): Rejected sets status to Needs Revision", async () => {
    const updated = await decideBlueprint({ id: blueprintId, approval: "Rejected" });
    assert.equal(updated.status, "Needs Revision");
  });

  test("blueprint decide(): Revision Required also sets status to Needs Revision", async () => {
    const updated = await decideBlueprint({ id: blueprintId, approval: "Revision Required" });
    assert.equal(updated.status, "Needs Revision");
  });

  test("blueprint decide(): Approved still sets status to Current", async () => {
    const updated = await decideBlueprint({ id: blueprintId, approval: "Approved" });
    assert.equal(updated.status, "Current");
  });
});
