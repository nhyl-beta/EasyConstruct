import type { ApiModule } from "../types.js";
import designRoutes from "./designs/routes.js";
import proposalRoutes from "./proposals/routes.js";
import designRevisionsRoutes from "./designs/design-revisions/routes.js";
import designRequestsRoutes from "./design-requests/routes.js";
import transmittalsRoutes from "./transmittals/routes.js";
import deliverablesRoutes from "./deliverables/routes.js";
import designReviewsRoutes from "./designs/design-reviews/routes.js";
import architectDocumentsRoutes from "./architect-documents/routes.js";
import blueprintsRoutes from "./blueprints/routes.js";
import publicReplyRoutes from "./design-requests/public-reply-routes.js";

export const module: ApiModule = {
  name: "design",
  flag: "MODULE_DESIGN",
  mounts: [
    { order: 1, prefix: "/api/designs", router: designRoutes },
    { order: 2, prefix: "/api/proposals", router: proposalRoutes },
    { order: 3, prefix: "/api/design-revisions", router: designRevisionsRoutes },
    { order: 5, prefix: "/api/design-requests", router: designRequestsRoutes },
    { order: 6, prefix: "/api/transmittals", router: transmittalsRoutes },
    { order: 7, prefix: "/api/deliverables", router: deliverablesRoutes },
    { order: 8, prefix: "/api/design-reviews", router: designReviewsRoutes },
    { order: 9, prefix: "/api/architect-documents", router: architectDocumentsRoutes },
    { order: 10, prefix: "/api/blueprints", router: blueprintsRoutes },
    { order: 31, prefix: "/api/public/rfi-replies", router: publicReplyRoutes },
  ],
  ownsTables: [
    "designs", "design_reviews", "design_revisions", "design_engineers",
    "design_requests", "design_request_files", "design_request_recipients",
    "design_request_reply_tokens", "transmittals", "transmittal_items",
    "transmittal_acknowledgements", "project_deliverables", "proposals",
    "blueprints", "architect_documents", "overdue_reminders",
  ],
};
