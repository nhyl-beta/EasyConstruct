import type { Response } from "express";

export function formatSuccess<T>(data: T, message = "OK") {
  return { success: true, message, data };
}

export function formatError(message: string, code = "ERROR") {
  return { success: false, message, code };
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  message = "OK",
) {
  return res.status(statusCode).json(
    formatSuccess(data, message),
  );
}

export function sendError(
  res: Response,
  message: string,
  statusCode = 500,
  code = "ERROR",
) {
  return res.status(statusCode).json(
    formatError(message, code),
  );
}