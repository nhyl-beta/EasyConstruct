import type { ApiModule } from "../types.js";
import notificationRoutes from "./notifications/route.js";
import auditLogRoutes from "./audit-logs/routes.js";
import cronRoutes from "./jobs/routes.js";
import referenceRoutes from "./reference/routes.js";

export const module: ApiModule = {
  name: "platform",
  mounts: [
    { order: 22, prefix: "/api/notifications", router: notificationRoutes },
    { order: 23, prefix: "/api/audit-logs", router: auditLogRoutes },
    { order: 35, prefix: "/api/cron", router: cronRoutes },
    { order: 36, prefix: "/api/reference", router: referenceRoutes },
  ],
  ownsTables: ["notifications", "audit_logs", "clients", "vendors"],
};
