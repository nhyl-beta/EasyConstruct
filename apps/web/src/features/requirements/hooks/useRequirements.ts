import { useRequirementsController } from "../controller/requirement.controller";

export const useRequirements = (options?: { pageSize?: number }) => {
  // Thin alias so future Refine integration can swap implementations in one place.
  return useRequirementsController(options);
};
