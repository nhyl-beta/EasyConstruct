import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { Response } from "express";
import { HEARTBEAT_MS, closeAll, open, subscriberCount } from "./stream.js";

const fakeRes = () => {
  const res = new EventEmitter() as EventEmitter & {
    written: string[];
    head?: Record<string, string>;
    flushed: boolean;
    writableEnded: boolean;
    destroyed: boolean;
  };
  res.written = [];
  res.flushed = false;
  res.writableEnded = false;
  res.destroyed = false;
  Object.assign(res, {
    writeHead: (_s: number, h: Record<string, string>) => void (res.head = h),
    flushHeaders: () => void (res.flushed = true),
    write: (c: string) => void res.written.push(c),
    end: () => {
      res.writableEnded = true;
      res.emit("close");
    },
  });
  return res;
};

test("stream sets proxy-safe headers, pings, and cleans up on close", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const res = fakeRes();
  const req = new EventEmitter();
  const before = subscriberCount();
  open(9001, res as unknown as Response, req);

  assert.equal(res.head?.["Cache-Control"], "no-cache, no-transform");
  assert.equal(res.head?.["X-Accel-Buffering"], "no");
  assert.equal(res.head?.Connection, "keep-alive");
  assert.equal(res.flushed, true);
  assert.equal(subscriberCount(), before + 1);

  t.mock.timers.tick(HEARTBEAT_MS);
  assert.ok(res.written.includes(": ping\n\n"));

  req.emit("close");
  assert.equal(subscriberCount(), before);
  const n = res.written.length;
  t.mock.timers.tick(HEARTBEAT_MS * 2);
  assert.equal(res.written.length, n, "timer stopped after close");
});

test("closeAll ends open streams", () => {
  const res = fakeRes();
  open(9002, res as unknown as Response, new EventEmitter());
  closeAll();
  assert.equal(res.writableEnded, true);
});
