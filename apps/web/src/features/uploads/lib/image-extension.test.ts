import { describe, expect, it } from "vitest";

import { imageExtension } from "./image-extension";

describe("imageExtension", () => {
  it("names a photo after what it is", () => {
    expect(imageExtension("image/png")).toBe("png");
    expect(imageExtension("image/jpeg")).toBe("jpg");
    expect(imageExtension("image/webp")).toBe("webp");
    expect(imageExtension("IMAGE/HEIC")).toBe("heic");
    expect(imageExtension("image/png; charset=binary")).toBe("png");
  });
  it("falls back to jpg for an unknown or missing type", () => {
    expect(imageExtension("")).toBe("jpg");
    expect(imageExtension(undefined)).toBe("jpg");
    expect(imageExtension("application/octet-stream")).toBe("jpg");
  });
});
