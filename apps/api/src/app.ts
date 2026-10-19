import express from "express";
import { cacheInvalidation } from "./core/cache/invalidate.js";
import { corsMiddleware } from "./core/http/cors.js";
import { errorMiddleware } from "./core/http/error.js";
import { logger } from "./core/http/logger.js";
import { requestId } from "./core/http/request-id.js";
import { securityHeaders } from "./core/http/security-headers.js";
import { getEnabledMounts } from "./modules/index.js";

const app = express();

app.use(express.json({ limit: "12mb" }));
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(corsMiddleware);
app.use(requestId);
app.use(logger);
app.use(cacheInvalidation);

for (const mount of getEnabledMounts()) {
  app.use(mount.prefix, ...(mount.middleware ?? []), mount.router);
}

app.use(errorMiddleware);

export default app;
