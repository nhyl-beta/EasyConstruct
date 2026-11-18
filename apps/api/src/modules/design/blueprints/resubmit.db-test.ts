// Real-database test (npm run test:db): a blueprint sent back for revision goes back to Pending when it is revised.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { blueprints } from "../../../core/db/schema/blueprints.js";
import { assertDemoDatabase } from "../../../../scripts/demo/demo-guard.js";
import * as service from "./service.js";

const dn = `ZZ-BP-${Date.now().toString(36)}`;

after(async () => {
  await db.delete(blueprints).where(eq(blueprints.drawingNumber, dn));
});

test("revising a blueprint that needs revision puts it back to Pending; an approved one is left alone", async () => {
  assertDemoDatabase();
  const bp = (await service.create({ drawingNumber: dn, title: "Plan", folder: "Architectural", author: "t" }))!;
  await service.decide({ id: bp.id, approval: "Revision Required" });
  assert.equal((await service.getById(bp.id)).status, "Needs Revision");

  const revised = await service.update(bp.id, { title: "Plan v2" });
  assert.equal(revised.approval, "Pending");
  assert.equal(revised.status, "Draft");

  await service.decide({ id: bp.id, approval: "Approved" });
  const edited = await service.update(bp.id, { title: "Plan v3" });
  assert.equal(edited.approval, "Approved");
});
