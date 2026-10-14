// Migration bookkeeping that does not touch the database.
//
// `server/drizzle/meta/_journal.json` lists the migrations; each tag must match a
// .sql file next to it. The runner (src/scripts/migrate.ts) applies what the
// database has not recorded yet, using the same hash and timestamp that
// drizzle-kit records, so either tool reads the same bookkeeping table.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

export interface MigrationFile extends JournalEntry {
  sql: string;
  hash: string;
  statements: string[];
}

export function readJournal(drizzleDir: string): JournalEntry[] {
  const raw = JSON.parse(readFileSync(join(drizzleDir, "meta", "_journal.json"), "utf8")) as { entries: JournalEntry[] };
  return raw.entries;
}

/** drizzle records the sha256 of the whole file. */
export function hashSql(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

export function splitStatements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadMigrations(drizzleDir: string): MigrationFile[] {
  return readJournal(drizzleDir).map((e) => {
    const sql = readFileSync(join(drizzleDir, `${e.tag}.sql`), "utf8");
    return { ...e, sql, hash: hashSql(sql), statements: splitStatements(sql) };
  });
}

/** Problems that would make a migration silently never run. Empty means consistent. */
export function checkJournal(drizzleDir: string): string[] {
  const problems: string[] = [];
  const entries = readJournal(drizzleDir);
  const files = new Set(readdirSync(drizzleDir).filter((f) => f.endsWith(".sql")).map((f) => f.replace(/\.sql$/, "")));
  const tags = new Set<string>();
  let previousWhen = 0;
  entries.forEach((e, i) => {
    if (e.idx !== i) problems.push(`journal entry ${e.tag} has idx ${e.idx}, expected ${i}`);
    if (tags.has(e.tag)) problems.push(`journal lists ${e.tag} twice`);
    tags.add(e.tag);
    if (!existsSync(join(drizzleDir, `${e.tag}.sql`))) problems.push(`journal entry ${e.tag} has no .sql file`);
    if (!e.tag.startsWith(String(i).padStart(4, "0") + "_")) problems.push(`journal entry ${e.tag} is out of order (position ${i})`);
    // drizzle skips every migration older than the newest one the database has recorded.
    if (e.when <= previousWhen) problems.push(`journal entry ${e.tag} has a timestamp not later than the entry before it`);
    previousWhen = e.when;
  });
  for (const f of files) if (!tags.has(f)) problems.push(`${f}.sql has no journal entry, so it would never be applied`);
  return problems;
}

export interface Plan {
  /** Not recorded in the database and to be applied now, in order. */
  pending: MigrationFile[];
  alreadyApplied: number;
}

/** Hash based, not timestamp based: a migration is pending when its hash is not recorded. */
export function planMigrations(all: MigrationFile[], recordedHashes: Set<string>): Plan {
  const pending = all.filter((m) => !recordedHashes.has(m.hash));
  return { pending, alreadyApplied: all.length - pending.length };
}
