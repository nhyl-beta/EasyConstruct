import { describe, expect, it } from "vitest";

import { clientToPrefill } from "./prefill-client";

describe("clientToPrefill", () => {
  it("fills an empty Client field from the project", () => {
    expect(clientToPrefill("", { client: "Metro Land Corp" })).toBe("Metro Land Corp");
    expect(clientToPrefill("   ", { client: " Metro Land Corp " })).toBe("Metro Land Corp");
  });
  it("never overwrites a client the person already chose", () => {
    expect(clientToPrefill("Their Own Client", { client: "Metro Land Corp" })).toBeNull();
  });
  it("does nothing when the project has no client, or the placeholder", () => {
    expect(clientToPrefill("", { client: null })).toBeNull();
    expect(clientToPrefill("", { client: "Unknown" })).toBeNull();
    expect(clientToPrefill("", undefined)).toBeNull();
  });
});
