// Real-database test (npm run test:db): the dashboard "Completed workflows" card and the Completed workflows page
// read the same records, so the page total always equals the card's number.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { assertDemoDatabase } from "../../../../scripts/demo/demo-guard.js";
import { count, eq } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { workflows } from "../../../core/db/schema/workflows.js";
import { getActiveWorkflowsPage } from "./service.js";

describe("completed workflows list", () => {
  test("the page total equals the dashboard count and holds only completed workflows", async () => {
    assertDemoDatabase();
    // Same query as the dashboard card (projects/dashboard/repository.ts workflowStatusCounts, no project scope).
    const [row] = await db.select({ n: count() }).from(workflows).where(eq(workflows.status, "completed"));
    const card = row?.n ?? 0;
    const page = await getActiveWorkflowsPage({}, { requested: true, page: 1, limit: 100, sort: undefined } as never, "completed");
    assert.equal(page.meta.total, card);
    assert.ok(page.items.every((w) => w.status === "completed"));
    const active = await getActiveWorkflowsPage({}, { requested: true, page: 1, limit: 100 } as never);
    assert.ok(active.items.every((w) => w.status === "active"));
  });
});
