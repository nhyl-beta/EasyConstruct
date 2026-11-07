import { describe, expect, it } from "vitest";
import { withViewableType } from "./file-url";

describe("withViewableType (B-207)", () => {
  it("gives a generic PDF or image its real type", () => {
    expect(withViewableType(new Blob(["x"], { type: "application/octet-stream" }), "s3:docs/a.pdf").type).toBe("application/pdf");
    expect(withViewableType(new Blob(["x"]), "/uploads/documents/p.PNG").type).toBe("image/png");
  });
  it("keeps a type the server already set", () => {
    expect(withViewableType(new Blob(["x"], { type: "image/jpeg" }), "a.png").type).toBe("image/jpeg");
  });
  it("leaves other files generic so they download", () => {
    expect(withViewableType(new Blob(["x"], { type: "application/octet-stream" }), "plan.dwg").type).toBe("application/octet-stream");
  });
});
