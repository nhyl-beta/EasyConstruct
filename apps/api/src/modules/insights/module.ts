import type { ApiModule } from "../types.js";
import planSuggestionRoutes from "./plan-suggestion/routes.js";
import reconciliationRoutes from "./reconciliation/routes.js";
import decisionSupportRoutes from "./decision-support/routes.js";
import aiValidationRoutes from "./ai-validation/routes.js";

export const module: ApiModule = {
  name: "insights",
  flag: "MODULE_INSIGHTS",
  mounts: [
    { order: 34, prefix: "/api/plan-suggestions", router: planSuggestionRoutes },
    { order: 37, prefix: "/api/admin/reconciliation", router: reconciliationRoutes },
    { order: 38, prefix: "/api/decision-support", router: decisionSupportRoutes },
    { order: 41, prefix: "/api/ai-validation", router: aiValidationRoutes },
  ],
  ownsTables: [
    "reference_snapshots", "validation_results", "ai_insights", "signal_findings",
    "plan_suggestions", "plan_suggestion_items", "decision_support_events",
  ],
};
