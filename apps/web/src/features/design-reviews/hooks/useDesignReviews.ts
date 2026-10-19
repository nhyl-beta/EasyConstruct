// hooks/useDesignReviews.ts
import { useDesignReviewsController } from "../controllers/design-reviews.controller";
/** `autoLoad: false` for callers that only create reviews (the architect dashboard): no list is fetched. */
export const useDesignReviews = (options?: { autoLoad?: boolean }) => useDesignReviewsController(options);