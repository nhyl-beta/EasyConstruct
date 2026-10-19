import type { ApiModule } from "../types.js";
import workflowRoutes from "./workflows/routes.js";

export const module: ApiModule = {
  name: "workflow",
  flag: "MODULE_WORKFLOW",
  mounts: [{ order: 32, prefix: "/api/workflows", router: workflowRoutes }],
  ownsTables: ["workflow_templates", "workflows", "workflow_stages", "workflow_attachments", "workflow_line_items"],
};
