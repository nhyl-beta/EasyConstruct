import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../repositories/uploads.repository", () => ({
  integrityRepository: { statuses: vi.fn(), check: vi.fn() },
}));

import { integrityRepository } from "../repositories/uploads.repository";
import { getIntegrity, refreshIntegrity, requestIntegrity, resetIntegrityStore } from "./integrity-store";

const statuses = vi.mocked(integrityRepository.statuses);

describe("integrity store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetIntegrityStore();
    statuses.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("urls asked for together go out as one request, and each url is asked for once", async () => {
    statuses.mockResolvedValue({ "/a": "verified", "/b": "damaged" });
    requestIntegrity("/a");
    requestIntegrity("/b");
    requestIntegrity("/a");
    await vi.advanceTimersByTimeAsync(50);
    expect(statuses).toHaveBeenCalledTimes(1);
    expect(statuses).toHaveBeenCalledWith(["/a", "/b"]);
    expect(getIntegrity("/a")).toBe("verified");
    expect(getIntegrity("/b")).toBe("damaged");
    requestIntegrity("/a");
    await vi.advanceTimersByTimeAsync(50);
    expect(statuses).toHaveBeenCalledTimes(1);
  });

  it("a url the server does not know is unverified", async () => {
    statuses.mockResolvedValue({});
    requestIntegrity("/new");
    await vi.advanceTimersByTimeAsync(50);
    expect(getIntegrity("/new")).toBe("unverified");
  });

  it("a failed lookup shows no badge instead of a wrong one", async () => {
    statuses.mockRejectedValue(new Error("offline"));
    requestIntegrity("/a");
    await vi.advanceTimersByTimeAsync(50);
    expect(getIntegrity("/a")).toBeUndefined();
  });

  it("refresh bypasses the cache", async () => {
    statuses.mockResolvedValueOnce({ "/a": "verified" }).mockResolvedValueOnce({ "/a": "damaged" });
    requestIntegrity("/a");
    await vi.advanceTimersByTimeAsync(50);
    expect(await refreshIntegrity("/a")).toBe("damaged");
    expect(getIntegrity("/a")).toBe("damaged");
  });
});
