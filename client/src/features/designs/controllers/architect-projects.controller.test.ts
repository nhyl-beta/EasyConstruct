import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@/services/api.client", () => ({ apiClient: { get: (...a: unknown[]) => get(...a) } }));

import { fetchArchitectProjectData } from "./architect-projects.controller";

describe("fetchArchitectProjectData", () => {
  beforeEach(() => get.mockReset());

  it("reads /projects and /designs through apiClient, which sends the Authorization header", async () => {
    get.mockImplementation((path: string) => Promise.resolve({ data: path === "/projects" ? [{ code: "P-1" }] : [{ projectCode: "P-1" }] }));
    const r = await fetchArchitectProjectData();
    expect(get.mock.calls.map((c) => c[0]).sort()).toEqual(["/designs", "/projects"]);
    expect(r.projects).toEqual([{ code: "P-1" }]);
    expect(r.designs).toHaveLength(1);
  });

  it("does not turn a 401 or 403 into an empty list: the error reaches the page", async () => {
    get.mockImplementation((path: string) => (path === "/projects" ? Promise.reject(new Error("Unauthorized")) : Promise.resolve({ data: [] })));
    await expect(fetchArchitectProjectData()).rejects.toThrow("Unauthorized");
  });

  it("an empty answer is an empty list", async () => {
    get.mockResolvedValue({ data: [] });
    expect(await fetchArchitectProjectData()).toEqual({ projects: [], designs: [] });
  });
});
