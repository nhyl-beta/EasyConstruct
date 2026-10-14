// server/src/middleware/auth.ts

import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import { UnauthorizedError, ForbiddenError } from "../utils/errors.js";
import { findSessionState } from "../auth/repository.js";
import { allowsQueryToken, isTokenSignedOut, sessionCutoff } from "../auth/session.js";

// A password change (reset link, or IT Designer's admin reset) signs out every
// session issued before it: the token's `iat` is compared with the account's
// password_changed_at. The lookup is cached briefly per user so it is not a
// query on every request; the process that performs a reset clears its own
// entry immediately, other instances catch up within the TTL.
const SESSION_CHECK_TTL_MS = 15_000;
const passwordChangedCache = new Map<number, { at: number; changedAt: number | null; validAfter: number | null; isActive: boolean }>();

export const invalidateSessionCache = (userId: number) => {
  passwordChangedCache.delete(userId);
};

// Also carries whether the account is still active: deactivating an account
// ends its existing sessions (within the cache TTL), not only new sign-ins.
const sessionState = async (userId: number): Promise<{ changedAt: number | null; validAfter: number | null; isActive: boolean } | undefined> => {
  const cached = passwordChangedCache.get(userId);
  if (cached && Date.now() - cached.at < SESSION_CHECK_TTL_MS) return cached;
  const state = await findSessionState(userId);
  if (state === undefined) return undefined; // account no longer exists
  const entry = {
    at: Date.now(),
    changedAt: state.changedAt ? state.changedAt.getTime() : null,
    validAfter: state.validAfter ? state.validAfter.getTime() : null,
    isActive: state.isActive,
  };
  passwordChangedCache.set(userId, entry);
  return entry;
};

export interface AuthedRequest extends Request {
  authUser?: {
    id: number;
    email: string;
    name: string;
    role: string;
  };
}

export async function authenticate(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  // C1: EventSource (used by the SSE notification stream) cannot set custom
  // request headers, so that one endpoint passes the token as ?token= instead
  // - accepted only on the stream route (auth/session.ts allowsQueryToken), only
  // when no Authorization header is present, and verified by the same jwt.verify() below.
  const queryToken =
    typeof req.query.token === "string" && allowsQueryToken(req.method, req.originalUrl.split("?")[0] ?? "") ? req.query.token : null;

  if (!header?.startsWith("Bearer ") && !queryToken) {
    return next(
      new UnauthorizedError(
        "Missing or malformed Authorization header",
      ),
    );
  }

  try {
    const token = header?.startsWith("Bearer ") ? header.slice(7) : queryToken!;

    const verified = jwt.verify(token, env.JWT_SECRET);

    if (typeof verified === "string") {
      return next(
        new UnauthorizedError("Invalid token payload"),
      );
    }

    // Validate the fields expected from our JWT. `name` is read
    // defensively (not required) so tokens issued before it was added to
    // the payload don't suddenly fail auth — see auth/service.ts.
    // `sub` is accepted as either a string or a number: auth/service.ts
    // signs it as `user.id` (a number), so requiring `string` here
    // rejected every token the app itself issues.
    if (
      (typeof verified.sub !== "string" && typeof verified.sub !== "number") ||
      typeof verified.email !== "string" ||
      typeof verified.role !== "string"
    ) {
      return next(
        new UnauthorizedError("Invalid token payload"),
      );
    }

    const userId = Number(verified.sub);

    if (!Number.isInteger(userId)) {
      return next(
        new UnauthorizedError("Invalid user ID in token"),
      );
    }

    // Signed out by a later password change? (`iat` is in whole seconds.)
    const state = await sessionState(userId);
    if (state === undefined) {
      return next(new UnauthorizedError("Account no longer exists"));
    }
    if (!state.isActive) {
      return next(new UnauthorizedError("This account has been deactivated. Contact your system administrator."));
    }
    // Signed out by a password change, a deactivation or an explicit sign-out.
    if (isTokenSignedOut(typeof verified.iat === "number" ? verified.iat : undefined, sessionCutoff(state.changedAt, state.validAfter))) {
      return next(new UnauthorizedError("Session expired — please sign in again"));
    }

    req.authUser = {
      id: userId,
      email: verified.email,
      name: typeof verified.name === "string" ? verified.name : verified.email,
      role: verified.role,
    };

    next();
  } catch {
    next(
      new UnauthorizedError("Invalid or expired token"),
    );
  }
}

export function requireRole(...roles: string[]) {
  return (
    req: AuthedRequest,
    _res: Response,
    next: NextFunction,
  ) => {
    if (!req.authUser) {
      return next(new UnauthorizedError());
    }

    if (!roles.includes(req.authUser.role)) {
      return next(
        new ForbiddenError(
          `Role '${req.authUser.role}' cannot access this resource`,
        ),
      );
    }

    next();
  };
}