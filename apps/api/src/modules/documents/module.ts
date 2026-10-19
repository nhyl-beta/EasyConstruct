import type { ApiModule } from "../types.js";
import documentRoutes from "./documents/routes.js";
import uploadRoutes from "./uploads/routes.js";

export const module: ApiModule = {
  name: "documents",
  mounts: [
    { order: 19, prefix: "/api/documents", router: documentRoutes },
    { order: 42, prefix: "/api/uploads", router: uploadRoutes },
  ],
  ownsTables: ["documents", "document_types", "stored_files"],
};
