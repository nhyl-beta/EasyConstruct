// apps/api/src/workflows/closeout-eligibility.test.ts — NEW (Q1)
//
// assertCloseoutWorkflowAllowed is a pure function over already-fetched data
// (no database access), same convention as lifecycle/gates.test.ts's pure
// LifecycleSnapshot checks — run with `npm test`.
//
// These four cases were also verified live against a running server before
// this refactor (POST /api/workflows with the "Project Closeout" template):
//   (a) engineer + project in Closeout  -> 201
//   (b) PM + project in Closeout        -> 403
//   (c) engineer + project in Construction -> 409
//   (d) admin + project in Closeout     -> 201
// matching exactly what's asserted below.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ConflictError, ForbiddenError } from "../core/utils/errors.js";
import { assertCloseoutWorkflowAllowed } from "./service.js";

const closeoutProject = { code: "DEMO-PRJ", status: "Closeout" };
const constructionProject = { code: "DEMO-STAGE-3", status: "Construction" };

describe("assertCloseoutWorkflowAllowed", () => {
  test("(a) engineer + project in Closeout: allowed", () => {
    assert.doesNotThrow(() =>
      assertCloseoutWorkflowAllowed({
        role: "engineer",
        project: closeoutProject,
        hasActiveCloseoutWorkflow: false,
      }),
    );
  });

  test("(b) PM + project in Closeout: 403 Forbidden", () => {
    assert.throws(
      () =>
        assertCloseoutWorkflowAllowed({
          role: "project-manager",
          project: closeoutProject,
          hasActiveCloseoutWorkflow: false,
        }),
      ForbiddenError,
    );
  });

  test("(c) engineer + project in Construction: 409 Conflict naming the phase", () => {
    assert.throws(
      () =>
        assertCloseoutWorkflowAllowed({
          role: "engineer",
          project: constructionProject,
          hasActiveCloseoutWorkflow: false,
        }),
      (err: unknown) => {
        assert.ok(err instanceof ConflictError);
        assert.match(err.message, /DEMO-STAGE-3/);
        assert.match(err.message, /"Construction"/);
        return true;
      },
    );
  });

  test("(d) admin + project in Closeout: allowed", () => {
    assert.doesNotThrow(() =>
      assertCloseoutWorkflowAllowed({
        role: "admin",
        project: closeoutProject,
        hasActiveCloseoutWorkflow: false,
      }),
    );
  });

  test("a second active Closeout workflow for the same project is rejected", () => {
    assert.throws(
      () =>
        assertCloseoutWorkflowAllowed({
          role: "engineer",
          project: closeoutProject,
          hasActiveCloseoutWorkflow: true,
        }),
      (err: unknown) => {
        assert.ok(err instanceof ConflictError);
        assert.match(err.message, /already in progress/);
        return true;
      },
    );
  });

  test("some other role on a non-Closeout project gets the role message, not the phase one", () => {
    // Role is checked first — a PM on a Construction-phase project should
    // not be told "advance it to Closeout first" as if that would help.
    assert.throws(
      () =>
        assertCloseoutWorkflowAllowed({
          role: "project-manager",
          project: constructionProject,
          hasActiveCloseoutWorkflow: false,
        }),
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenError);
        assert.match(err.message, /Only Engineer/);
        return true;
      },
    );
  });
});
