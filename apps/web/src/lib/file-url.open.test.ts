import { describe, expect, it, vi } from "vitest";

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m) } }));

import { openFileUrl } from "./file-url";

describe("openFileUrl (B-53)", () => {
  it("says so when the file was never stored, instead of doing nothing", async () => {
    await openFileUrl("local-upload-123.pdf");
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/never stored/));
  });
});
