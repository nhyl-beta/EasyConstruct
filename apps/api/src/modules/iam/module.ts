import type { ApiModule } from "../types.js";
import { authRoutes } from "./auth/routes.js";
import roleRoutes from "./roles/routes.js";
import userRoutes from "./users/routes.js";
import ownerApprovalRoutes from "./owner-approvals/routes.js";
import publicOwnerApprovalRoutes from "./owner-approvals/public-routes.js";
import userSettingsRoutes from "./user-settings/routes.js";

export const module: ApiModule = {
  name: "iam",
  mounts: [
    { order: 16, prefix: "/api/auth", router: authRoutes },
    { order: 26, prefix: "/api/roles", router: roleRoutes },
    { order: 27, prefix: "/api/users", router: userRoutes },
    { order: 30, prefix: "/api/me/settings", router: userSettingsRoutes },
    { order: 29, prefix: "/api/owner-approvals", router: ownerApprovalRoutes },
    { order: 32, prefix: "/api/public/owner-approvals", router: publicOwnerApprovalRoutes },
  ],
  ownsTables: ["roles", "users", "password_reset_tokens", "owner_action_requests"],
};
