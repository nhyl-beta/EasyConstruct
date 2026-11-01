// Read-only analysis of the file-01 cells where the matrix says Deny but the API answered 2xx.
// For each cell it repeats the GET as that role and reports status, row count, and whether returned rows
// carry identities / project references that are NOT the caller's own. Nothing is relabelled or written to the DB.
//   method: rows are the first array found in the response body. A row is "other user's" if it has an identity
//   field (userId, createdBy, uploadedBy, assignee, email, employeeId ...) whose value is not the caller's id,
//   email or name; "other project's" if it names a project code the caller is neither PM of nor a member of.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { loadSessions } from "../api.js";
import { assertQaEnvironment } from "../guard.js";
import { parseCsv } from "../spec.js";
import { ROLES } from "../roles.js";

const cfg = assertQaEnvironment();
const latest = readFileSync(join(import.meta.dirname, "..", "..", "results", "latest.txt"), "utf8").trim();
const table = parseCsv(readFileSync(join(latest, "01_access_matrix.csv"), "utf8"));
const head = table[0]!;
const col = (n: string) => head.indexOf(n);

const cells: { role: string; path: string }[] = [];
for (const r of table.slice(1)) {
  const actual = r[col("Actual Results")] ?? "";
  const m = actual.match(/GET (\S+) as .+? should be 403, got (2\d\d)/);
  if (r[col("Status")] === "Failed" && m) cells.push({ role: r[col("Role")]!, path: m[1]! });
}

const sessions = await loadSessions(ROLES.map((r) => r.label), true);
const db = new pg.Client({ connectionString: cfg.databaseUrl });
await db.connect();
const allCodes = new Set<string>((await db.query("select code from projects")).rows.map((r) => r.code));

const firstArray = (d: any): any[] | null => {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") for (const k of ["items", "rows", "data", "results", "projects", "users", "logs", "workflows", "documents", "tasks", "issues"]) { const a = firstArray(d[k]); if (a) return a; }
  if (d && typeof d === "object") for (const v of Object.values(d)) if (Array.isArray(v)) return v as any[];
  return null;
};

const IDENT = /^(user_?id|created_?by(_?id)?|submitted_?by(_?id)?|uploaded_?by(_?id)?|owner(_?id)?|assignee(_?id)?|assigned_?to(_?user_?id|_?name)?|employee_?id|email|requested_?by|author|reporter|reported_?by(_?user_?id|_?name)?|pm_?user_?id|engineer|reviewed_?by)$/i;
const PROJ = /^(project_?code|project|code)$/i;

const out: string[][] = [["Role", "Endpoint", "Method", "HTTP status", "Rows returned", "Rows with another user's identity", "Rows on another project", "Belongs to others?", "Basis"]];
for (const c of cells) {
  const s = sessions[c.role]!;
  const mine = new Set((await db.query("select project_code c from project_members where user_id=$1 union select code from projects where pm_user_id=$1", [s.userId])).rows.map((r) => r.c));
  const res = await fetch(`${cfg.apiUrl}${c.path}`, { headers: { Authorization: `Bearer ${s.token}` } });
  const body: any = await res.json().catch(() => null);
  const rows = firstArray(body?.data) ?? firstArray(body);
  let otherUsers = 0, otherProjects = 0, identSeen = 0, projSeen = 0;
  for (const row of rows ?? []) {
    if (!row || typeof row !== "object") continue;
    let ou = false, op = false;
    for (const [k, v] of Object.entries(row)) {
      if (IDENT.test(k) && (typeof v === "string" || typeof v === "number") && v !== "") {
        identSeen++;
        const mineVal = v === s.userId || String(v).toLowerCase() === s.email.toLowerCase() || String(v) === s.name;
        if (!mineVal) ou = true;
      }
      if (PROJ.test(k) && typeof v === "string" && allCodes.has(v)) { projSeen++; if (!mine.has(v)) op = true; }
    }
    if (ou) otherUsers++;
    if (op) otherProjects++;
  }
  const n = rows?.length ?? 0;
  const verdict = n === 0 ? "No rows returned" : otherUsers + otherProjects > 0 ? "Yes" : identSeen + projSeen === 0 ? "Not determinable (no owner/project fields)" : "No (only the caller's own)";
  out.push([c.role, c.path, "GET", String(res.status), rows ? String(n) : "non-list", String(otherUsers), String(otherProjects), verdict, `identity fields seen ${identSeen}, project refs seen ${projSeen}; caller projects ${mine.size}`]);
}
await db.end();
const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const file = join(import.meta.dirname, "..", "..", "results", "deny-exposure.csv");
writeFileSync(file, out.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n");
console.log(`${cells.length} cells -> ${file}`);
