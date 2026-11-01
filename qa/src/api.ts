// Thin API client for tests and setup. Talks only to QA_API_URL (guarded).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertQaEnvironment } from "./guard.js";
import { QA_PASSWORD, roleByLabel } from "./roles.js";

const QA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
export const AUTH_DIR = join(QA_DIR, ".auth");
const TOKENS_FILE = join(AUTH_DIR, "tokens.json");

export interface Session { token: string; userId?: number; name?: string; email: string }
export interface ApiResult<T = any> { status: number; ok: boolean; body: any; data: T }

const apiUrl = () => assertQaEnvironment().apiUrl.replace(/\/$/, "");

async function rawFetch(method: string, path: string, token: string | null, body?: unknown): Promise<ApiResult> {
  const res = await fetch(`${apiUrl()}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body: json, data: json?.data };
}

export async function loginAs(roleLabel: string): Promise<Session> {
  const r = roleByLabel(roleLabel);
  const res = await rawFetch("POST", "/auth/login", null, { email: r.email, password: QA_PASSWORD });
  if (!res.ok) throw new Error(`QA login failed for ${roleLabel} (${r.email}): ${res.status} ${res.body?.message ?? ""}. Has qa:reset been run against this API's database?`);
  const u = res.data?.user ?? {};
  return { token: res.data.token, userId: u.id, name: u.name, email: r.email };
}

/** Sessions are created once per run (sign-in is rate limited: 40 / 15 min / address) and shared via .auth/tokens.json. */
export async function loadSessions(labels: string[], refresh = false): Promise<Record<string, Session>> {
  let cache: Record<string, Session> = {};
  if (!refresh && existsSync(TOKENS_FILE)) cache = JSON.parse(readFileSync(TOKENS_FILE, "utf8"));
  let dirty = false;
  // Sign-in is rate limited, so a cached token is reused while it has more than 15 minutes left (and it still works).
  const fresh = (t: string) => { try { const exp = JSON.parse(Buffer.from(t.split(".")[1]!, "base64url").toString()).exp; return typeof exp === "number" && exp * 1000 > Date.now() + 15 * 60_000; } catch { return false; } };
  for (const l of labels) if (!cache[l] || !fresh(cache[l]!.token)) { cache[l] = await loginAs(l); dirty = true; }
  if (dirty) { mkdirSync(AUTH_DIR, { recursive: true }); writeFileSync(TOKENS_FILE, JSON.stringify(cache, null, 2)); }
  return cache;
}

export async function session(roleLabel: string): Promise<Session> {
  return (await loadSessions([roleLabel]))[roleLabel]!;
}

/** Call the API as a role (or with no token when role is null). */
export async function call(role: string | null, method: string, path: string, body?: unknown): Promise<ApiResult> {
  return rawFetch(method, path, role ? (await session(role)).token : null, body);
}

export async function callOk(role: string, method: string, path: string, body?: unknown): Promise<ApiResult> {
  const r = await call(role, method, path, body);
  if (!r.ok) throw new Error(`${method} ${path} as ${role} -> ${r.status}: ${r.body?.message ?? JSON.stringify(r.body)}`);
  return r;
}

// ── Project factory ──────────────────────────────────────────────────────────────────────────────
export type TargetPhase = "Proposal" | "Design" | "Pre-Construction" | "Construction" | "Closeout" | "Completed" | "Archived" | "On Hold" | "Cancelled";
const ORDER: TargetPhase[] = ["Proposal", "Design", "Pre-Construction", "Construction", "Closeout", "Completed"];
const iso = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
const plusDays = (n: number) => iso(new Date(Date.now() + n * 864e5));
let seq = 0;

export interface CreateProjectOptions {
  phase?: TargetPhase;
  /** "Construction" (default) or "Design" (Proposal -> Design -> Turnover/Closeout -> Completed). */
  deliveryType?: "Construction" | "Design";
  name?: string;
  contractValue?: number;
  siteLatitude?: number; siteLongitude?: number; geofenceRadiusM?: number;
  /** Role that creates the project (default Admin; the PM may also create). */
  creator?: string;
  /** Leave the site latitude/longitude unset (gate C5 then needs them). */
  noSite?: boolean;
  /** Design projects: the plan-set disciplines (default Architectural only). */
  disciplines?: string[];
  /** Role whose seeded account is named as the project's PM (default Project Manager). */
  pmRole?: string;
}
export interface QaProject { id: number; code: string; name: string; phase: string; deliveryType: string; raw: any }

/**
 * Creates a fresh project through the real API (as Admin, assigned to the seeded PM) and moves it to `phase`.
 * Phases after Proposal are reached with the documented Admin override (reason >= 10 chars) so a lifecycle test
 * never depends on a shared DEMO project. The override is recorded in phase history; tests that exercise a gate
 * must not use this shortcut for the gate under test and should build real state instead.
 */
/** Moves an existing project to `phase` with the documented Admin override (no gates satisfied). */
export async function fastForward(id: number, phase: TargetPhase, deliveryType: "Construction" | "Design" = "Construction"): Promise<void> {
  const read = async () => (await callOk("Admin", "GET", `/projects/${id}`)).data;
  const walk = phase === "Archived" ? "Completed" : phase === "On Hold" ? "Design" : phase;
  let proj = await read();
  if (ORDER.includes(walk as TargetPhase)) {
    for (let i = 0; i < 8 && proj.status !== walk; i++) {
      const r = await call("Admin", "POST", `/projects/${id}/lifecycle/advance`, { override: true, reason: `QA fast-forward to ${walk}` });
      if (!r.ok) throw new Error(`fastForward: advance from ${proj.status} failed: ${r.status} ${r.body?.message}`);
      proj = await read();
    }
  }
  if (phase === "Archived") await callOk("Admin", "POST", `/projects/${id}/lifecycle/archive`, {});
  if (phase === "On Hold") await callOk("Admin", "POST", `/projects/${id}/lifecycle/hold`, { reason: "QA hold for lock tests" });
  if (phase === "Cancelled") await callOk("Admin", "POST", `/projects/${id}/lifecycle/cancel`, { reason: "QA cancel for lock tests" });
}

export async function createProject(opts: CreateProjectOptions = {}): Promise<QaProject> {
  const phase = opts.phase ?? "Proposal";
  const deliveryType = opts.deliveryType ?? "Construction";
  const pm = await session(opts.pmRole ?? "Project Manager");
  // unique across parallel workers: time + process id + counter + random
  const code = `QA-${Date.now().toString(36).slice(-5)}${process.pid.toString(36).slice(-2)}${(seq++ % 36).toString(36)}${Math.floor(Math.random() * 36).toString(36)}`.toUpperCase();
  const body: Record<string, unknown> = {
    confirmSimilar: true, // names are generated, similarity warning is not under test
    name: opts.name ?? `QA project ${code}`, code, pm: pm.name ?? "Miguel Santos",
    due: plusDays(120), plannedStartDate: plusDays(1), projectType: "Commercial", risk: "Low",
    client: "QA Client", location: "Quezon City", currency: "PHP", description: "Created by the QA suite",
    contractValue: opts.contractValue ?? 1_000_000, deliveryType,
    ...(opts.noSite ? {} : { siteLatitude: opts.siteLatitude ?? 14.6, siteLongitude: opts.siteLongitude ?? 121.0, geofenceRadiusM: opts.geofenceRadiusM ?? 300 }),
    ...(deliveryType === "Design" ? { designDisciplines: opts.disciplines ?? ["Architectural"] } : {}),
  };
  const created = await callOk(opts.creator ?? "Admin", "POST", "/projects", body);
  const id: number = created.data.id;
  const read = async () => (await callOk("Admin", "GET", `/projects/${id}`)).data;
  let proj = await read();

  const walk = phase === "Archived" ? "Completed" : phase === "On Hold" ? "Design" : phase;
  if (ORDER.includes(walk as TargetPhase)) {
    for (let i = 0; i < 8 && proj.status !== walk; i++) {
      const r = await call("Admin", "POST", `/projects/${id}/lifecycle/advance`, { override: true, reason: `QA fast-forward to ${walk}` });
      if (!r.ok) throw new Error(`createProject: advance from ${proj.status} failed: ${r.status} ${r.body?.message}`);
      proj = await read();
    }
    if (proj.status !== walk && !(deliveryType === "Design" && walk === "Closeout")) throw new Error(`createProject: could not reach ${walk}, stuck at ${proj.status}`);
  }
  if (phase === "Archived") await callOk("Admin", "POST", `/projects/${id}/lifecycle/archive`, {});
  if (phase === "On Hold") await callOk("Admin", "POST", `/projects/${id}/lifecycle/hold`, { reason: "QA hold for lock tests" });
  if (phase === "Cancelled") await callOk("Admin", "POST", `/projects/${id}/lifecycle/cancel`, { reason: "QA cancel for lock tests" });
  proj = await read();
  return { id, code, name: proj.name, phase: proj.status, deliveryType, raw: proj };
}
