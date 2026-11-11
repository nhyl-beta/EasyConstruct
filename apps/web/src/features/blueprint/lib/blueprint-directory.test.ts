import { describe, expect, it } from "vitest";
import type { Blueprint } from "../types/blueprint.types";
import { architectFolders, filesIn, NO_PROJECT, projectFolders } from "./blueprint-directory";

const bp = (id: number, projectCode: string | null, author: string, folder = "Structural"): Blueprint => ({
  id, drawingNumber: `A-${id}`, title: `Drawing ${id}`, folder, discipline: null, scale: null, revision: "A", author,
  approval: "Pending", status: "Current", fileType: "PDF", sizeKb: 1, fileUrl: null, thumbnail: null, favorite: false, tags: null,
  projectCode, designId: null, issueDate: null, latestRevisionDate: null,
});

const all = [bp(1, "DEMO-S3", "Ana"), bp(2, "DEMO-S3", "Ben"), bp(3, "DEMO-S4", "Ana"), bp(4, "DEMO-S4", "Ana"), bp(5, null, "Ben")];

describe("blueprint directory", () => {
  it("makes one folder per project, with drawings that have no project in their own folder", () => {
    expect(projectFolders(all)).toEqual([
      { name: "DEMO-S3", count: 2 },
      { name: "DEMO-S4", count: 2 },
      { name: NO_PROJECT, count: 1 },
    ]);
  });
  it("gives each architect their own folder inside a project, even when two use the same discipline folder", () => {
    expect(architectFolders(all, "DEMO-S3")).toEqual([{ name: "Ana", count: 1 }, { name: "Ben", count: 1 }]);
    expect(architectFolders(all, "DEMO-S4")).toEqual([{ name: "Ana", count: 2 }]);
  });
  it("lists only that architect's drawings in that project", () => {
    expect(filesIn(all, "DEMO-S4", "Ana").map((b) => b.id)).toEqual([3, 4]);
    expect(filesIn(all, NO_PROJECT, null).map((b) => b.id)).toEqual([5]);
    expect(filesIn(all, null, null)).toHaveLength(5);
  });
});
