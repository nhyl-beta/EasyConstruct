// Real-database test (npm run test:db): the Bill of Materials reference lists only approved proposals with an amount.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { proposals } from "../../../core/db/schema/proposals.js";
import { assertDemoDatabase } from "../../../../scripts/demo/demo-guard.js";
import * as repo from "./repository.js";

const code = `ZZ-BOQ-${Date.now().toString(36)}`;

after(async () => {
  await db.delete(proposals).where(eq(proposals.projectCode, code));
});

test("only an approved proposal's Bill of Materials total is offered as a reference", async () => {
  assertDemoDatabase();
  const base = { projectCode: code, submittedBy: "t" };
  await db.insert(proposals).values([
    { ...base, proposalId: `${code}-1`, title: "Approved", status: "Approved", amount: "2850855.00" },
    { ...base, proposalId: `${code}-2`, title: "Pending", status: "Pending", amount: "100.00" },
  ]);
  const refs = await repo.findApprovedProposalBoqs(code);
  assert.deepEqual(refs.map((r) => [r.title, r.amount]), [["Approved", 2850855]]);
});
