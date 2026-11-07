import type { DesignReview } from "../types/design-review.types";

export type ReviewTab = "all" | "pending" | "approved" | "revision" | "rejected";

export const REVIEW_TABS: { value: ReviewTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "revision", label: "Revision requested" },
  { value: "rejected", label: "Rejected" },
];

/** Same buckets as the Blueprint reviews page: a review sent back for changes is its own bucket (B-206). */
export function filterReviews(reviews: DesignReview[], tab: ReviewTab): DesignReview[] {
  switch (tab) {
    case "pending":
      return reviews.filter((r) => r.status === "Pending");
    case "approved":
      return reviews.filter((r) => r.status === "Approved");
    case "revision":
      return reviews.filter((r) => r.status === "Changes Requested");
    case "rejected":
      return reviews.filter((r) => r.status === "Rejected");
    default:
      return reviews;
  }
}

/** A review can still be decided while it is Pending or has been sent back for changes. */
export const isDecidable = (r: Pick<DesignReview, "status">) => r.status === "Pending" || r.status === "Changes Requested";
