// Real-database test (npm run test:db): the dashboard "Completed workflows" card and the Completed workflows page
// read the same records, so the page total always equals the card's number.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { assertDemoDatabase } from "../../../../scripts/demo/demo-guard.js";
import { workflowStatusCounts } from "../../projects/dashboard/repository.js";
import { getActiveWorkflowsPage } from "./service.js";

describe("completed workflows list", () => {
  test("the page total equals the dashboard count and holds only completed workflows", async () => {
    assertDemoDatabase();
    const card = (await workflowStatusCounts(null)).find((r) => r.status === "completed")?.n ?? 0;
    const page = await getActiveWorkflowsPage({}, { requested: true, page: 1, limit: 100, sort: undefined } as never, "completed");
    assert.equal(page.meta.total, card);
    assert.ok(page.items.every((w) => w.status === "completed"));
    const active = await getActiveWorkflowsPage({}, { requested: true, page: 1, limit: 100 } as never);
    assert.ok(active.items.every((w) => w.status === "active"));
  });
});
