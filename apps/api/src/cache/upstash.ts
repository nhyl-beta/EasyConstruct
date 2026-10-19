// apps/api/src/cache/upstash.ts - Redis through Upstash's REST API.
//
// REST (plain HTTPS) rather than a TCP Redis client, because the server runs
// on Vercel serverless where long-lived sockets are a poor fit. Every command
// has a short timeout and no retries: a slow or failing cache must cost a
// request a few hundred milliseconds at most, never fail it.
import { Redis } from "@upstash/redis";
import type { CacheStore } from "./store.js";

export const REDIS_COMMAND_TIMEOUT_MS = 400;

export class UpstashCacheStore implements CacheStore {
  readonly kind = "redis" as const;
  private readonly redis: Redis;

  constructor(url: string, token: string, private readonly timeoutMs = REDIS_COMMAND_TIMEOUT_MS) {
    this.redis = new Redis({
      url,
      token,
      retry: false,
      // We store our own JSON strings; do not let the client re-parse them.
      automaticDeserialization: false,
      signal: () => AbortSignal.timeout(this.timeoutMs),
    });
  }

  async get(key: string): Promise<string | null> {
    const value = await this.redis.get<string | null>(key);
    return value == null ? null : String(value);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, { ex: Math.max(1, Math.ceil(ttlSeconds)) });
  }

  async incr(key: string): Promise<number> {
    return this.redis.incr(key);
  }
}
