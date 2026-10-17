import { describe, expect, it } from "vitest";
import { isValidEmail, validateStakeholder } from "./stakeholder.repository";

describe("stakeholder form validation", () => {
  it("needs a name and a known role", () => {
    expect(validateStakeholder({ name: "", role: "Owner" }).name).toBeTruthy();
    expect(validateStakeholder({ name: "Ana Cruz", role: "Owner" })).toEqual({});
    // @ts-expect-error an unknown role is refused
    expect(validateStakeholder({ name: "Ana Cruz", role: "Supplier" }).role).toBeTruthy();
  });

  it("an email is optional but must look like one when given", () => {
    expect(validateStakeholder({ name: "Ana Cruz", role: "Other", email: "" })).toEqual({});
    expect(validateStakeholder({ name: "Ana Cruz", role: "Other", email: "ana@cruz" }).email).toBeTruthy();
    expect(validateStakeholder({ name: "Ana Cruz", role: "Other", email: "ana@cruz.example" })).toEqual({});
    expect(isValidEmail(" a@b.co ")).toBe(true);
  });
});
