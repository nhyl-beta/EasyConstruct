import { useEngineeringReportsController, type ReportsListOptions } from "../controllers/engineering-report.controller";

export const useEngineeringReports = (
  scope: "progress" | "issues" | "all" = "all",
  options?: ReportsListOptions,
) => {
  // Thin alias so future Refine integration can swap implementations in one place.
  return useEngineeringReportsController(scope, options);
};
