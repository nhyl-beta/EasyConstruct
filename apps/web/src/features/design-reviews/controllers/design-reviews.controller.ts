// controllers/design-reviews.controller.ts
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/services/api.client";
import { STALE } from "@/lib/query-client";
import type { DesignReview } from "../types/design-review.types";
import type { Design } from "@/features/designs/types/design.types";

export const useDesignReviewsController = ({ autoLoad = true }: { autoLoad?: boolean } = {}) => {
  const [reviews, setReviews] = useState<DesignReview[]>([]);
  const [loading, setLoading] = useState(autoLoad);
  // Joined client-side so a review row can show the design's name, project and
  // files (GET /designs is open to every authenticated role).
  const [designsById, setDesignsById] = useState<Record<number, Design>>({});
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");

  // Was raw fetch() with no Authorization header — authenticate() has always
  // required a Bearer token (apps/api/src/middleware/auth.ts), so this 401'd
  // on every call and the page silently showed "No reviews in this bucket."
  const fetchReviews = useCallback(() => {
    setLoading(true);
    apiClient
      .get("/design-reviews")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((json: any) => setReviews(json.data ?? []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (autoLoad) fetchReviews(); }, [fetchReviews, autoLoad]);

  useEffect(() => {
    if (!autoLoad) return;
    apiClient
      .get("/designs", { staleTime: STALE.list })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((json: any) => {
        const rows: Design[] = json?.data ?? [];
        setDesignsById(Object.fromEntries(rows.map((d) => [d.id, d])));
      })
      .catch((err) => console.error(err));
  }, [autoLoad]);

  const decide = async (id: number, decision: "Approved" | "Rejected" | "Changes Requested") => {
    await apiClient.post(`/design-reviews/${id}/decide`, { decision });
    fetchReviews();
  };

  // Part C2: architect-dashboard.tsx's "Request review" quick action was
  // hardcoded `disabled` even though POST /design-reviews already works
  // (apps/api/src/designs/design-reviews/service.ts create()) — this is the
  // real create call, matching createDesignReviewSchema's shape exactly
  // (apps/api/src/validators/design-review-validator.ts).
  const create = async (input: {
    code: string;
    designId: number;
    requestedBy: string;
    discipline?: string;
    priority?: string;
    dueDate?: string;
  }) => {
    await apiClient.post("/design-reviews", input);
    fetchReviews();
  };

  const filtered = useMemo(() => {
    if (tab === "pending") return reviews.filter((r) => r.status === "Pending" || r.status === "Changes Requested");
    if (tab === "approved") return reviews.filter((r) => r.status === "Approved");
    return reviews.filter((r) => r.status === "Rejected");
  }, [reviews, tab]);

  return { reviews, filtered, designsById, loading, tab, setTab, decide, create };
};