// apps/api/src/notifications/stream.ts — NEW (C1)
//
// A tiny in-process per-user SSE broadcaster. No new dependency: plain
// `res.write` SSE framing server-side, native EventSource client-side.
// notifications/service.ts calls publishToUser/publishToRole right after it
// persists a row — the same single choke point every domain event already
// goes through (notifyProject/create), so no per-call-site wiring is needed.
//
// In-process only: fine for this app's single-server deployment. A
// multi-instance deployment would need a shared pub/sub (e.g. Postgres
// LISTEN/NOTIFY) instead of this in-memory Map — out of scope here.
import type { Response } from "express";
import type { Notification } from "../../../core/db/schema/notifications.js";

type NotificationRecord = Notification;

const subscribersByUser = new Map<number, Set<Response>>();

export const subscribe = (userId: number, res: Response): void => {
  const set = subscribersByUser.get(userId) ?? new Set<Response>();
  set.add(res);
  subscribersByUser.set(userId, set);
};

export const unsubscribe = (userId: number, res: Response): void => {
  const set = subscribersByUser.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) subscribersByUser.delete(userId);
};

export const HEARTBEAT_MS = 25_000;

/** Number of open streams (all users). */
export const subscriberCount = (): number => {
  let n = 0;
  for (const set of subscribersByUser.values()) n += set.size;
  return n;
};

/**
 * Attaches an SSE response: writes the proxy-friendly headers, sends a `: ping` comment every
 * HEARTBEAT_MS so idle proxies keep the connection open, and cleans up (timer + subscriber) on close/error.
 */
export const open = (userId: number, res: Response, req: { on(event: string, cb: () => void): unknown }): void => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write(": connected\n\n");

  subscribe(userId, res);
  const timer = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) res.write(": ping\n\n");
  }, HEARTBEAT_MS);
  timer.unref();
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearInterval(timer);
    unsubscribe(userId, res);
  };
  req.on("close", cleanup);
  req.on("error", cleanup);
  res.on("close", cleanup);
  res.on("error", cleanup);
};

/** Ends every open stream (graceful shutdown). Clients reconnect on their own. */
export const closeAll = (): void => {
  for (const set of [...subscribersByUser.values()]) {
    for (const res of [...set]) res.end();
  }
};

const writeEvent = (res: Response, notification: NotificationRecord): void => {
  res.write(`event: notification\ndata: ${JSON.stringify(notification)}\n\n`);
};

export const publishToUser = (userId: number, notification: NotificationRecord): void => {
  const set = subscribersByUser.get(userId);
  if (!set) return;
  for (const res of set) writeEvent(res, notification);
};

export const publishToUsers = (userIds: number[], notification: NotificationRecord): void => {
  for (const userId of userIds) publishToUser(userId, notification);
};
