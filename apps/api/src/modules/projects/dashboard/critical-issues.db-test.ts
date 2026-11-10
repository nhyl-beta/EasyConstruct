// Real-database test (npm run test:db): B-164. "Critical issues" is one rule on the Engineer dashboard and on the
// Issues page: severity Critical and not Resolved.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { issues } from "../../../core/db/schema/issues.js";
import { assertDemoDatabase } from "../../../../scripts/demo/demo-guard.js";
import * as issuesRepo from "../issues/repository.js";
import * as dashboardRepo from "./repository.js";

const tag = `DBC${Date.now().toString(36)}`;
const P = `ZZ-${tag}`;

describe("critical issues count", () => {
  before(async () => {
    assertDemoDatabase();
    const base = { projectCode: P, description: "x", reportedByName: "t", reportedByRole: "engineer" };
    await db.insert(issues).values([
      { ...base, issueCode: `I-${tag}-1`, title: "open critical", severity: "Critical", status: "Submitted" },
      { ...base, issueCode: `I-${tag}-2`, title: "resolved critical", severity: "Critical", status: "Resolved" },
      { ...base, issueCode: `I-${tag}-3`, title: "medium", severity: "Medium", status: "Submitted" },
    ]);
  });

  after(async () => {
    await db.delete(issues).where(eq(issues.projectCode, P));
  });

  test("one open critical, one resolved critical and one medium count as 1 on both screens", async () => {
    assert.equal(await dashboardRepo.criticalOpenIssueCount([P]), 1);
    const { severityCounts } = await issuesRepo.headlineCounts({ codes: [P] });
    assert.equal(severityCounts.find((r) => r.key === "Critical")?.count ?? 0, 1);
  });
});
