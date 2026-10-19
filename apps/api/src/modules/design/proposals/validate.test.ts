import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureValidation, PROPOSAL_VALIDATE_ROLES } from "./validation.js";
import { ForbiddenError } from "../../../core/utils/errors.js";
import { requireRole, type AuthedRequest } from "../../../core/auth/middleware.js";

const proposal = { title: "Warehouse design proposal", content: "A".repeat(40), amount: "500000", projectCode: "PRJ-1" };

describe("ensureValidation", () => {
  test("computes and flags the result as new when nothing is stored", () => {
    const out = ensureValidation({ ...proposal, aiValidation: null }, true);
    assert.equal(out.changed, true);
    const parsed = JSON.parse(out.aiValidation);
    assert.equal(parsed.passed, true);
    assert.deepEqual(parsed.issues, []);
  });

  test("is idempotent: a stored summary is returned unchanged", () => {
    const first = ensureValidation({ ...proposal, aiValidation: null }, true);
    const again = ensureValidation({ ...proposal, aiValidation: first.aiValidation }, true);
    assert.equal(again.changed, false);
    assert.equal(again.aiValidation, first.aiValidation);
  });

  test("reports completeness problems but never a status", () => {
    const out = ensureValidation({ title: "Hi", content: "", amount: "", projectCode: "X", aiValidation: null }, false);
    const parsed = JSON.parse(out.aiValidation);
    assert.equal(parsed.passed, false);
    assert.ok(parsed.issues.length >= 2);
    assert.ok(!("status" in parsed));
  });
});

test("flag off: validate is a 404 and does nothing (FEATURE_AI=false)", async () => {
  const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
  const check = `
    import { proposalService } from "./src/modules/design/proposals/service.js";
    import { NotFoundError } from "./src/core/utils/errors.js";
    try {
      await proposalService.validate(1);
      throw new Error("Proposal validation should be disabled");
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }
  `;
  execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", check], {
    cwd: apiRoot,
    env: { ...process.env, FEATURE_AI: "false" },
  });
});

describe("role guard", () => {
  const run = (role: string) => {
    let err: unknown;
    requireRole(...PROPOSAL_VALIDATE_ROLES)(
      { authUser: { id: 1, email: "a@b.c", name: "A", role } } as AuthedRequest,
      {} as never,
      (e?: unknown) => {
        err = e;
      },
    );
    return err;
  };

  test("consultant, project-manager, architect and admin may validate", () => {
    for (const role of ["consultant", "project-manager", "architect", "admin"]) assert.equal(run(role), undefined);
  });
  test("other roles are refused", () => {
    for (const role of ["engineer", "site-personnel", "owner", "finance-manager"]) {
      assert.ok(run(role) instanceof ForbiddenError);
    }
  });
});
