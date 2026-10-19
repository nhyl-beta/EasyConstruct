import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { HTTP } from "../constants/http-status.js";
import { AppError } from "../utils/errors.js";
import { formatError } from "../utils/response.js";
import { mapPgError } from "./pg-errors.js";
import { mapBodyParserError } from "./body-errors.js";

export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof multer.MulterError) {
    const statusCode =
      err.code === "LIMIT_FILE_SIZE"
        ? 413
        : 400;

    res.status(statusCode).json(
      formatError(
        err.code === "LIMIT_FILE_SIZE"
          ? "The uploaded file is too large. Maximum size is 10 MB."
          : err.message,
        err.code === "LIMIT_FILE_SIZE"
          ? "FILE_TOO_LARGE"
          : "UPLOAD_ERROR",
      ),
    );
    return;
  }

  if (
    err.message.startsWith(
      "Unsupported file type.",
    )
  ) {
    res.status(400).json(
      formatError(
        err.message,
        "UNSUPPORTED_FILE_TYPE",
      ),
    );
    return;
  }

  // body-parser rejecting an oversized JSON body (a base64 upload past the
  // limit set in app.ts). Without this it reached the generic branch below
  // and reported as a 500, which read as a server crash rather than "your
  // file is too big".
  if ((err as { type?: string }).type === "entity.too.large") {
    res.status(413).json(
      formatError(
        "The uploaded file is too large. Maximum size is 8 MB.",
        "FILE_TOO_LARGE",
      ),
    );
    return;
  }

  // express.json() rejecting a malformed body (before any route runs) is the client's mistake: 400.
  const body = mapBodyParserError(err);
  if (body) {
    res.status(body.status).json(formatError(body.message, body.code));
    return;
  }

  if (err instanceof AppError) {
    res
      .status(err.statusCode)
      .json({ ...formatError(err.message, err.code), ...err.extra });
    return;
  }

  // Postgres errors that mean a bad request or a conflict (unique, bad id format, missing required
  // field, foreign key) instead of a bare 500. See middleware/pg-errors.ts.
  const mapped = mapPgError(err);
  if (mapped) {
    res.status(mapped.status).json(formatError(mapped.message, mapped.code));
    return;
  }

  console.error("[Unhandled]", err);
  res
    .status(HTTP.SERVER_ERROR)
    .json(formatError("Internal server error", "SERVER_ERROR"));
}
