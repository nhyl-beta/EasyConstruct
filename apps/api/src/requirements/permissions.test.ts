import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  assertSitePersonnelMayCreate,
  assertSitePersonnelMayUpdate,
  isOwnRequirement,
} from "./permissions.js";
import { ForbiddenError } from "../utils/errors.js";

const own = { createdBy: "Rico Domingo", status: "Draft" };

describe("site personnel creating requirements", () => {
  test("staffed site personnel can create a draft or a submitted requirement", () => {
    assert.doesNotThrow(() => assertSitePersonnelMayCreate({}, true));
    assert.doesNotThrow(() => assertSitePersonnelMayCreate({ status: "Draft" }, true));
    assert.doesNotThrow(() => assertSitePersonnelMayCreate({ status: "Under Review" }, true));
  });

  test("cannot create on a project they are not staffed on", () => {
    assert.throws(() => assertSitePersonnelMayCreate({ status: "Draft" }, false), ForbiddenError);
  });

  test("cannot create an already approved or rejected requirement", () => {
    for (const status of ["Approved", "Rejected"]) {
      assert.throws(() => assertSitePersonnelMayCreate({ status }, true), ForbiddenError);
    }
  });
});

describe("site personnel updating requirements", () => {
  test("can submit their own draft", () => {
    assert.doesNotThrow(() => assertSitePersonnelMayUpdate(own, { status: "Under Review" }, "rico domingo", true));
  });

  test("can edit the content of their own draft", () => {
    assert.doesNotThrow(() =>
      assertSitePersonnelMayUpdate(own, { title: "New title", description: "A new description text" }, "Rico Domingo", true),
    );
  });

  test("cannot approve or reject, even their own", () => {
    for (const status of ["Approved", "Rejected"]) {
      assert.throws(() => assertSitePersonnelMayUpdate(own, { status }, "Rico Domingo", true), ForbiddenError);
    }
  });

  test("cannot touch someone else's requirement", () => {
    assert.throws(
      () => assertSitePersonnelMayUpdate({ createdBy: "Paolo Mendoza", status: "Draft" }, { status: "Under Review" }, "Rico Domingo", true),
      ForbiddenError,
    );
  });

  test("cannot change a requirement that is no longer a draft", () => {
    assert.throws(
      () => assertSitePersonnelMayUpdate({ ...own, status: "Under Review" }, { title: "x y z w" }, "Rico Domingo", true),
      ForbiddenError,
    );
  });

  test("cannot move a requirement to another project or change its author", () => {
    assert.throws(() => assertSitePersonnelMayUpdate(own, { project: "OTHER-1" }, "Rico Domingo", true), ForbiddenError);
    assert.throws(() => assertSitePersonnelMayUpdate(own, { createdBy: "Someone Else" }, "Rico Domingo", true), ForbiddenError);
  });

  test("cannot update when no longer staffed on the project", () => {
    assert.throws(() => assertSitePersonnelMayUpdate(own, { status: "Under Review" }, "Rico Domingo", false), ForbiddenError);
  });
});

test("isOwnRequirement ignores case and surrounding spaces", () => {
  assert.equal(isOwnRequirement(" Rico Domingo ", "rico domingo"), true);
  assert.equal(isOwnRequirement("Rico Domingo", "Rico Domingos"), false);
});
