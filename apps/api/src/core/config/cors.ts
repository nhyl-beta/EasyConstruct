import { env } from "./env.js";

export const corsConfig = {
  origin:      env.CORS_ORIGIN,
  credentials: true,
  methods:     ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  // Lets the browser (and the client's own diagnostics) read the timing and cache headers.
  exposedHeaders: ['Server-Timing', 'X-Cache', 'X-Request-ID'],
};