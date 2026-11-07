import { describe, expect, it } from "vitest";
import { statusTone } from "./status-config";

describe("statusTone (one status-to-colour map)", () => {
  it("gives the same colour to a word however it is cased or separated", () => {
    expect(statusTone("In Review")).toBe(statusTone("in_review"));
    expect(statusTone("In review")).toBe("warning");
    expect(statusTone("Approved as noted")).toBe(statusTone("approved_as_noted"));
  });
  it("keeps exact keys first and unknown words neutral", () => {
    expect(statusTone("Active")).toBe("success");
    expect(statusTone("Present")).toBe("success");
    expect(statusTone("Absent")).toBe("danger");
    expect(statusTone("something new")).toBe("neutral");
  });
});
