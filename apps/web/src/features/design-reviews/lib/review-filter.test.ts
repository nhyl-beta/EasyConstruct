import { describe, expect, it } from "vitest";
import { filterReviews, isDecidable } from "./review-filter";
import type { DesignReview } from "../types/design-review.types";

const r = (id: number, status: string) => ({ id, status }) as unknown as DesignReview;
const rows = [r(1, "Pending"), r(2, "Approved"), r(3, "Changes Requested"), r(4, "Rejected")];

describe("design review filter (B-206)", () => {
  it("has a Revision requested bucket with only sent-back reviews", () => {
    expect(filterReviews(rows, "revision").map((x) => x.id)).toEqual([3]);
  });
  it("All returns everything and the other buckets stay apart", () => {
    expect(filterReviews(rows, "all")).toHaveLength(4);
    expect(filterReviews(rows, "pending").map((x) => x.id)).toEqual([1]);
    expect(filterReviews(rows, "approved").map((x) => x.id)).toEqual([2]);
    expect(filterReviews(rows, "rejected").map((x) => x.id)).toEqual([4]);
  });
  it("only pending and sent-back reviews can still be decided", () => {
    expect(rows.filter(isDecidable).map((x) => x.id)).toEqual([1, 3]);
  });
});
