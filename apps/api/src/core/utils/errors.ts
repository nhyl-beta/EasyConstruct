export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code:       string,
    message:           string,
    // Extra JSON fields merged into the error response alongside
    // {success,message,code} — e.g. GateBlockedError's `failing` array.
    // Optional and unused by every existing subclass.
    public extra?:      Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, 'VALIDATION_ERROR', message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(404, 'NOT_FOUND', id ? `${resource} ${id} not found` : `${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, "FORBIDDEN", message);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string, extra?: Record<string, unknown>) {
    super(409, "CONFLICT", message, extra);
    this.name = "ConflictError";
  }
}

/**
 * A blocked lifecycle Advance — 409 with the failing gate checks attached
 * (see lifecycle/service.ts advance and the spec's
 * `POST .../lifecycle/advance` contract). The admin-override path bypasses
 * this entirely rather than throwing and catching it.
 */
export class GateBlockedError extends AppError {
  constructor(failing: Array<{ key: string; label: string }>) {
    super(
      409,
      "GATE_BLOCKED",
      `Cannot advance — ${failing.length} check(s) failing: ${failing.map((f) => f.key).join(", ")}`,
      { failing },
    );
    this.name = "GateBlockedError";
  }
}
/** Stable error code for a second clock-in on the same day (409). The offline queue drops entries on it. */
export const DUPLICATE_ATTENDANCE_CODE = "ATTENDANCE_DUPLICATE";
