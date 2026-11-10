import { describe, expect, it } from "vitest";
import type { DesignRequest } from "../types/request.types";
import { nestFollowUps } from "./nest-follow-ups";

const req = (id: number, followUpOfId: number | null = null) => ({ id, number: `00${id}-26`, followUpOfId }) as DesignRequest;

describe("nestFollowUps", () => {
  it("puts a follow-up under its original and not at the top level", () => {
    const rows = nestFollowUps([req(2, 1), req(1)]);
    expect(rows.map((r) => r.request.id)).toEqual([1]);
    expect(rows[0]!.followUps.map((f) => f.id)).toEqual([2]);
  });

  it("keeps a follow-up at the top level when its original is not in the list", () => {
    const rows = nestFollowUps([req(2, 1)]);
    expect(rows.map((r) => r.request.id)).toEqual([2]);
    expect(rows[0]!.followUps).toEqual([]);
  });

  it("orders follow-ups oldest first and leaves other requests alone", () => {
    const rows = nestFollowUps([req(4, 1), req(3), req(2, 1), req(1)]);
    expect(rows.map((r) => r.request.id)).toEqual([3, 1]);
    expect(rows[1]!.followUps.map((f) => f.id)).toEqual([2, 4]);
  });
});
