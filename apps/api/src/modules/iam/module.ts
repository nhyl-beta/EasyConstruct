import type { ApiModule } from "../types.js";
import { authRoutes } from "./auth/routes.js";
import roleRoutes from "./roles/routes.js";
import userRoutes from "./users/routes.js";
import userSettingsRoutes from "./user-settings/routes.js";

export const module: ApiModule = {
  name: "iam",
  mounts: [
    { order: 16, prefix: "/api/auth", router: authRoutes },
    { order: 26, prefix: "/api/roles", router: roleRoutes },
    { order: 27, prefix: "/api/users", router: userRoutes },
    { order: 30, prefix: "/api/me/settings", router: userSettingsRoutes },
  ],
  ownsTables: ["roles", "users", "password_reset_tokens"],
};
