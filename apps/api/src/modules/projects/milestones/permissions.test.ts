import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { assertEngineerMayUpdate, openLinkedTasks, shouldAutoComplete } from "./permissions.js";
import { ForbiddenError } from "../../../core/utils/errors.js";

describe("assertEngineerMayUpdate", () => {
  test("staffed engineer can complete an active or at-risk milestone", () => {
    assert.doesNotThrow(() => assertEngineerMayUpdate({ status: "completed" }, "active", true));
    assert.doesNotThrow(() => assertEngineerMayUpdate({ status: "completed" }, "at-risk", true));
  });

  test("cannot complete on a project they are not staffed on", () => {
    assert.throws(() => assertEngineerMayUpdate({ status: "completed" }, "active", false), ForbiddenError);
  });

  test("cannot edit any other field, even alongside completion", () => {
    assert.throws(() => assertEngineerMayUpdate({ status: "completed", title: "x" }, "active", true), ForbiddenError);
    assert.throws(() => assertEngineerMayUpdate({ estimatedCompletionDate: "2026-12-31" }, "active", true), ForbiddenError);
    assert.throws(() => assertEngineerMayUpdate({ description: "x" }, "active", true), ForbiddenError);
  });

  test("cannot set any status other than completed", () => {
    for (const status of ["draft", "active", "at-risk", "cancelled"] as const) {
      assert.throws(() => assertEngineerMayUpdate({ status }, "active", true), ForbiddenError);
    }
  });

  test("cannot complete from draft, cancelled or already-completed", () => {
    for (const from of ["draft", "cancelled", "completed"]) {
      assert.throws(() => assertEngineerMayUpdate({ status: "completed" }, from, true), ForbiddenError);
    }
  });
});

describe("openLinkedTasks", () => {
  test("lists linked tasks that are not Completed", () => {
    assert.deepEqual(
      openLinkedTasks([
        { linkType: "task", task: { title: "Pour slab", status: "In Progress" } },
        { linkType: "task", task: { title: "Cure slab", status: "Completed" } },
        { linkType: "task", task: { title: "Inspect", status: "Pending" } },
      ]),
      ["Pour slab", "Inspect"],
    );
  });

  test("ignores non-task links, missing tasks, and returns [] when everything is done", () => {
    assert.deepEqual(
      openLinkedTasks([
        { linkType: "document", task: undefined },
        { linkType: "task", task: null },
        { linkType: "task", task: { title: "Done", status: "Completed" } },
      ]),
      [],
    );
  });
});

describe("shouldAutoComplete (B-225)", () => {
  const done = { linkType: "task", task: { status: "Completed" } };
  const open = { linkType: "task", task: { status: "In Progress" } };
  test("completes when every linked task is Completed, in Construction", () => {
    assert.equal(shouldAutoComplete({ phase: "Construction", milestoneStatus: "active", links: [done, done] }), true);
  });
  test("not while a task is open, or with no task link", () => {
    assert.equal(shouldAutoComplete({ phase: "Construction", milestoneStatus: "active", links: [done, open] }), false);
    assert.equal(shouldAutoComplete({ phase: "Construction", milestoneStatus: "active", links: [] }), false);
    assert.equal(shouldAutoComplete({ phase: "Construction", milestoneStatus: "active", links: [{ linkType: "document" }] }), false);
  });
  test("only in Construction", () => {
    assert.equal(shouldAutoComplete({ phase: "Design", milestoneStatus: "active", links: [done] }), false);
  });
  test("never touches a completed or cancelled milestone", () => {
    assert.equal(shouldAutoComplete({ phase: "Construction", milestoneStatus: "completed", links: [done] }), false);
    assert.equal(shouldAutoComplete({ phase: "Construction", milestoneStatus: "cancelled", links: [done] }), false);
  });
});
