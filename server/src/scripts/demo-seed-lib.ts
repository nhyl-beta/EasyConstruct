// server/src/scripts/demo-seed-lib.ts
//
// Shared plumbing for the demo seeders (demo-seed-stages.ts, demo-seed-roles.ts):
// login, a tiny API client, the cast of existing accounts (read only — we log
// in as them, we never write to the users table), and which account is staffed
// on which of the seven projects.
import "dotenv/config";
import pg from "pg";
import { assertDemoApi, assertDemoDatabase } from "./demo-guard.js";

export const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:8000/api";
export const PASSWORD = "Demo@12345";

/** Existing demo accounts. Passwords/emails come from seed-demo-accounts.ts and are never changed. */
export const EMAILS = {
  pm: "pm@easyconstruct.demo",
  pm1: "projectmanager1@easyconstruct.demo",
  architect: "architect@easyconstruct.demo",
  architect1: "architect1@easyconstruct.demo",
  consultant: "consultant@easyconstruct.demo",
  consultant1: "consultant1@easyconstruct.demo",
  engineer: "engineer@easyconstruct.demo",
  engineer1: "engineer1@easyconstruct.demo",
  site: "site@easyconstruct.demo",
  site1: "sitepersonnel1@easyconstruct.demo",
  finance: "finance@easyconstruct.demo",
  hr: "hr@easyconstruct.demo",
  admin: "admin@easyconstruct.demo",
  // The seeded Owner is the real owner email, not owner@easyconstruct.demo (see seed-demo-accounts.ts).
  owner: process.env.DEMO_OWNER_EMAIL?.trim() || "nhylcyrusgervasio@gmail.com",
  itdesigner: "itdesigner@easyconstruct.demo",
} as const;
export type AccountKey = keyof typeof EMAILS;

/** Field accounts the seeders clock in and pay, so each must have a linked employee row. */
const NEEDS_EMPLOYEE: AccountKey[] = ["site", "site1", "engineer", "engineer1"];

/**
 * The employee row linked to each email through users.id -> employees.user_id,
 * read at run time. The EMP-DEMO-nn numbers depend on the order accounts were
 * seeded, so they differ between databases and must never be hardcoded.
 * Read-only.
 */
export async function linkedEmployeeIds(emails: readonly string[]): Promise<Map<string, string>> {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const r = await c.query(
      `SELECT u.email, e.employee_id FROM users u JOIN employees e ON e.user_id = u.id WHERE u.email = ANY($1) ORDER BY e.id`,
      [emails],
    );
    const out = new Map<string, string>();
    for (const row of r.rows as { email: string; employee_id: string }[]) if (!out.has(row.email)) out.set(row.email, row.employee_id);
    return out;
  } finally {
    await c.end();
  }
}

/** Throws, naming every account in `emails` that has no linked employee. */
export function requireLinkedEmployees(links: Map<string, string>, emails: readonly string[]): void {
  const missing = emails.filter((e) => !links.has(e));
  if (missing.length) {
    throw new Error(
      `No employee is linked (employees.user_id -> users.id) to: ${missing.join(", ")}. ` +
        "Link them with npm run db:seed; the demo seeders never edit users or employees.",
    );
  }
}

export async function login(email: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const json = (await res.json()) as { data?: { token?: string }; message?: string };
  if (res.status === 429 || /too many sign-in attempts/i.test(json.message ?? "")) throw new SignInLimiterError(email, json.message);
  if (!res.ok) throw new Error(`Login failed for ${email}: ${json.message}`);
  return json.data!.token!;
}

/**
 * The API limits sign-ins (40 per 15 minutes per address) and the seeds sign in as many accounts. When
 * that trips, carrying on only produces confusing 401s later, so stop with what to do. Every seed script
 * is idempotent, so after restarting the API the one that stopped (and any after it in the demo:seed chain:
 * demo-seed-stages, then demo-seed-roles, demo-seed-revisions, demo-revisions, demo-seed-requests,
 * demo-seed-design, demo-seed-owner-payroll, demo-seed-procurement) can simply be run again.
 */
export class SignInLimiterError extends Error {
  constructor(email: string, detail?: string) {
    super(
      [
        `Sign-in limiter reached while signing in as ${email}${detail ? ` (${detail})` : ""}.`,
        "  Restart the API (it clears the limiter), then run this script again. Scripts that already finished are safe to skip or rerun.",
        "  Remaining chain, in order: npm run demo:seed (runs demo-employees, demo-seed-stages, then demo:seed-roles).",
      ].join("\n"),
    );
    this.name = "SignInLimiterError";
  }
}

export async function api<T = any>(
  path: string,
  token: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; message?: string };
  if (!res.ok) {
    throw new Error(`${opts.method ?? "GET"} ${path} -> ${res.status}: ${json.message ?? JSON.stringify(json)}`);
  }
  return json.data as T;
}

/** Like api(), but returns the HTTP status and never throws — for scoping / rejection proofs. */
export async function raw(path: string, token: string, opts: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as { data?: any; message?: string; meta?: any };
  return { status: res.status, data: json.data, message: json.message, meta: json.meta };
}

export interface Account {
  key: AccountKey;
  id: number;
  name: string;
  email: string;
  token: string;
  employeeId?: string;
}
export type Session = Record<AccountKey, Account>;

export async function openSession(): Promise<Session> {
  assertDemoDatabase();
  assertDemoApi(BASE);
  const entries = await Promise.all(
    (Object.keys(EMAILS) as AccountKey[]).map(async (key) => {
      try {
        return [key, await login(EMAILS[key])] as const;
      } catch (e) {
        if (e instanceof SignInLimiterError) throw e;
        console.warn(`  (skipping ${EMAILS[key]}: ${(e as Error).message})`);
        return [key, ""] as const;
      }
    }),
  );
  const tokens = Object.fromEntries(entries) as Record<AccountKey, string>;
  const users = await api<{ id: number; name: string; email: string }[]>("/users", tokens.admin);
  const links = await linkedEmployeeIds(Object.values(EMAILS));
  requireLinkedEmployees(links, NEEDS_EMPLOYEE.map((k) => EMAILS[k]));
  const out = {} as Session;
  for (const key of Object.keys(EMAILS) as AccountKey[]) {
    if (!tokens[key]) continue;
    const u = users.find((x) => x.email === EMAILS[key]);
    if (!u) throw new Error(`Account ${EMAILS[key]} not found`);
    out[key] = { key, id: u.id, name: u.name, email: u.email, token: tokens[key], employeeId: links.get(u.email) };
  }
  return out;
}

/** Who is staffed on which demo project (accounts only; scoping is visible because nobody is on all seven). */
export interface Team {
  pm: AccountKey;
  architect: AccountKey;
  consultant: AccountKey;
  engineer?: AccountKey;
  site?: AccountKey;
}
export const TEAMS: Record<string, Team> = {
  "DEMO-S1": { pm: "pm", architect: "architect", consultant: "consultant" },
  "DEMO-S2": { pm: "pm", architect: "architect", consultant: "consultant", engineer: "engineer" },
  "DEMO-S3": { pm: "pm", architect: "architect", consultant: "consultant", engineer: "engineer", site: "site" },
  "DEMO-S4": { pm: "pm", architect: "architect", consultant: "consultant", engineer: "engineer", site: "site" },
  "DEMO-S5": { pm: "pm", architect: "architect1", consultant: "consultant1", engineer: "engineer", site: "site" },
  "DEMO-S6": { pm: "pm1", architect: "architect1", consultant: "consultant", engineer: "engineer1", site: "site" },
  "DEMO-S7": { pm: "pm1", architect: "architect1", consultant: "consultant1", engineer: "engineer1", site: "site1" },
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** YYYY-MM-DD, n days from an ISO date. */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Today in the business timezone (the create validator rejects past dates). */
export const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
