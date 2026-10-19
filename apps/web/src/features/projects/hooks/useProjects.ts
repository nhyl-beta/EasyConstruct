import { useProjectsController } from "../controllers/project.controller";

/** All active projects as a shared lookup list (pickers, dropdowns, quick search). */
export const useProjects = () => useProjectsController();
