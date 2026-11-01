// "Scoped" access (owner decision 2026-11-01, item e): operational roles see assigned projects only. This looks up which projects a
// user is assigned to (PM of, or a project member) in the QA database, read-only, and finds returned rows outside that set.
import pg from "pg";
import { assertQaEnvironment } from "./guard.js";

let client: pg.Client | null = null;
const cache = new Map<number, Set<string>>();
const db = async () => (client ??= await (async () => { const c = new pg.Client({ connectionString: assertQaEnvironment().databaseUrl }); await c.connect(); return c; })());

export async function assignedProjects(userId: number): Promise<Set<string>> {
  if (cache.has(userId)) return cache.get(userId)!;
  const r = await (await db()).query("select project_code c from project_members where user_id=$1 union select code from projects where pm_user_id=$1", [userId]);
  const set = new Set<string>(r.rows.map((x) => x.c));
  cache.set(userId, set);
  return set;
}
export async function closeScopeDb() { await client?.end().catch(() => {}); client = null; }

const firstArray = (d: any): any[] | null => {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") for (const v of Object.values(d)) if (Array.isArray(v)) return v as any[];
  return null;
};
export const rowsOf = (data: unknown): any[] => firstArray((data as any)?.data ?? data) ?? [];

let allCodes: Set<string> | null = null;
/** Project codes mentioned by each row (projectCode / project / code on a project row), compared with the user's assignment. */
export async function scopeViolations(rows: any[], userId: number): Promise<{ checked: number; outside: string[] }> {
  const mine = await assignedProjects(userId);
  allCodes ??= new Set<string>((await (await db()).query("select code from projects")).rows.map((r) => r.code));
  const outside = new Set<string>(); let checked = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    let code: string | null = null;
    for (const k of ["projectCode", "project_code", "project", "code"]) { const v = (row as any)[k]; if (typeof v === "string" && allCodes.has(v)) { code = v; break; } }
    if (!code) continue;
    checked++;
    if (!mine.has(code)) outside.add(code);
  }
  return { checked, outside: [...outside] };
}
