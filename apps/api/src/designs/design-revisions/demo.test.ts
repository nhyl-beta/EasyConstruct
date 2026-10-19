import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { planChain } from "./demo.js";
import { isDemoAllowed } from "./controller.js";

const base = {
  projectCode: "DEMO-S4",
  designCode: "DSN-DEMO-S4",
  discipline: "Structural",
  projectStatus: "Construction",
  start: new Date("2026-01-01T00:00:00Z"),
  now: new Date("2026-10-04T00:00:00Z"),
  authors: ["Ana Villanueva", "Paolo Mendoza"],
};

describe("planChain", () => {
  test("is deterministic for the same project and design", () => {
    assert.deepEqual(planChain(base), planChain(base));
  });

  test("3 to 5 revisions chained v0.1 → v1.0 → v1.1 → v2.0, numbered 1..n, first has no parent", () => {
    const chain = planChain(base);
    assert.ok(chain.length >= 3 && chain.length <= 5);
    chain.forEach((r, i) => {
      assert.equal(r.revisionNumber, i + 1);
      assert.equal(r.parentVersion, i === 0 ? null : chain[i - 1]!.version);
    });
    assert.deepEqual(chain.slice(0, 4).map((r) => r.version), ["v0.1", "v1.0", "v1.1", "v2.0"].slice(0, Math.min(4, chain.length)));
  });

  test("dates increase, never exceed now, and approval follows creation", () => {
    const chain = planChain(base);
    for (let i = 0; i < chain.length; i++) {
      const r = chain[i]!;
      assert.ok(r.createdAt.getTime() <= base.now.getTime());
      assert.ok(r.createdAt.getTime() >= base.start.getTime());
      if (i > 0) assert.ok(r.createdAt.getTime() > chain[i - 1]!.createdAt.getTime());
      if (r.approvedAt) {
        assert.ok(r.approvedAt.getTime() >= r.createdAt.getTime());
        assert.ok(r.approvedAt.getTime() <= base.now.getTime());
        assert.equal(r.status, "Approved");
      } else {
        assert.notEqual(r.status, "Approved");
      }
    }
  });

  test("the latest revision is Under Review in Design and Approved later", () => {
    assert.equal(planChain({ ...base, projectStatus: "Design" }).at(-1)!.status, "Under Review");
    assert.equal(planChain({ ...base, projectStatus: "Construction" }).at(-1)!.status, "Approved");
  });

  test("reasons fit the 255-character column and authors come from the supplied names", () => {
    for (const d of ["Structural", "Architectural", "MEPF", "Civil", "Other"]) {
      for (const r of planChain({ ...base, discipline: d })) {
        assert.ok(r.reason.length <= 255);
        assert.ok(base.authors.includes(r.createdBy));
      }
    }
  });
});

describe("isDemoAllowed (production guard)", () => {
  test("allowed outside production", () => {
    assert.equal(isDemoAllowed("development", undefined), true);
  });
  test("refused in production unless ALLOW_DEMO_SEED=true", () => {
    assert.equal(isDemoAllowed("production", undefined), false);
    assert.equal(isDemoAllowed("production", "false"), false);
    assert.equal(isDemoAllowed("production", "true"), true);
  });
});
