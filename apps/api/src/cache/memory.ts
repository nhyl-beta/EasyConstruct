// apps/api/src/cache/memory.ts - in-process TTL store, used when no Redis is configured.
import type { CacheStore } from "./store.js";

interface Entry {
  value: string;
  expiresAt: number;
}

export class MemoryCacheStore implements CacheStore {
  readonly kind = "memory" as const;
  private readonly entries = new Map<string, Entry>();
  private readonly counters = new Map<string, number>();

  constructor(
    private readonly maxEntries = 500,
    private readonly now: () => number = Date.now,
  ) {}

  async get(key: string): Promise<string | null> {
    // Counters (version stamps) never expire and are read back as strings, like Redis.
    const counter = this.counters.get(key);
    if (counter !== undefined) return String(counter);
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    // Re-insert so the Map's order is least-recently-used first.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
    this.evict();
  }

  async incr(key: string): Promise<number> {
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }

  get size() {
    return this.entries.size;
  }

  private evict() {
    if (this.entries.size <= this.maxEntries) return;
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
    // Still over the bound: drop the least recently used.
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}
