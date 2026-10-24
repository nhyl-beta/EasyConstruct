import express from "express";
import { env } from "./core/config/env.js";
import { cacheInvalidation } from "./core/cache/invalidate.js";
import { corsMiddleware } from "./core/http/cors.js";
import { healthHandler } from "./core/http/health.js";
import { errorMiddleware } from "./core/http/error.js";
import { logger } from "./core/http/logger.js";
import { requestId } from "./core/http/request-id.js";
import { securityHeaders } from "./core/http/security-headers.js";
import { getEnabledMounts } from "./modules/index.js";

const app = express();

// Behind Render's proxy req.ip would otherwise be the proxy's address, collapsing the per-address
// sign-in limiter and audit logging into one bucket. TRUST_PROXY = number of proxy hops (0 = none).
if (env.TRUST_PROXY > 0) app.set("trust proxy", env.TRUST_PROXY);

app.use(express.json({ limit: "12mb" }));
app.disable("x-powered-by");
app.use(securityHeaders);
// Liveness probe for the host / Docker HEALTHCHECK: before auth, no database or cache call.
app.get("/api/health", healthHandler);
app.use(corsMiddleware);
app.use(requestId);
app.use(logger);
app.use(cacheInvalidation);

for (const mount of getEnabledMounts()) {
  app.use(mount.prefix, ...(mount.middleware ?? []), mount.router);
}

app.use(errorMiddleware);

export default app;
