// apps/api/src/middleware/security-headers.ts (objectives fix 1.5)
//
// A small set of response headers every API answer carries. Chosen to be safe for
// a JSON API consumed by a separate browser origin: nothing here restricts
// cross-origin fetches (CORS does that), and there is deliberately no
// Content-Security-Policy or Cross-Origin-Resource-Policy, which would risk
// breaking the app for little gain on a JSON API. The static client sets its own
// headers (client/vercel.json).
import type { NextFunction, Request, Response } from "express";

export const SECURITY_HEADERS: Record<string, string> = {
  // Stop browsers guessing a content type (stored files are served through /api/uploads/file).
  "X-Content-Type-Options": "nosniff",
  // An API response has no business being framed.
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  // Browsers only honor this over HTTPS, so it is harmless on local http.
  "Strict-Transport-Security": "max-age=15552000; includeSubDomains",
  "X-DNS-Prefetch-Control": "off",
  "X-Permitted-Cross-Domain-Policies": "none",
};

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    // A route that already set a header on purpose (the file download route sets nosniff) keeps its value.
    if (!res.getHeader(name)) res.setHeader(name, value);
  }
  next();
}
