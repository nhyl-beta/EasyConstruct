// Regenerates qa/spec/03_role_page_checks.csv from the current access matrix (01), so checks that contradict an owner decision disappear and
// checks for newly allowed pages / actions appear. Rules, all read from the existing file 03 (which is consistent: every role gets the same
// list of check types for a given page and access class):
//   class Full         -> the page's Full check types        (for example NAVIGATE, CONTENT, SEARCH / FILTER, PAGINATION, FORM VALIDATION)
//   class View         -> the page's View check types        (... READ-ONLY instead of FORM VALIDATION). View, Scoped, Reference read, Names only,
//                         Directory only and Basic list all belong to this class.
//   class Deny         -> DENIED;  Allowed action -> ACTION-ALLOWED;  Deny on an ACTION / FUNCTION row -> ACTION-DENIED
// A check that still applies keeps its ID. A new check gets the next free number of its role. Removed and added checks are logged in
// qa/spec/03_regeneration_log.csv. Running it again on its own output changes nothing.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadMatrix, parseCsv } from "../spec.js";
import { ROLES } from "../roles.js";

const SPEC = join(import.meta.dirname, "..", "..", "spec");
const file = join(SPEC, "03_role_page_checks.csv");
const [head, ...body] = parseCsv(readFileSync(file, "utf8"));
const col = (n: string) => head!.indexOf(n);
const rows = body.map((r) => Object.fromEntries(head!.map((h, i) => [h, r[i] ?? ""])));

const ORDER = ["NAVIGATE", "CONTENT", "SEARCH / FILTER", "PAGINATION", "FORM VALIDATION", "READ-ONLY", "DENIED", "ACTION-ALLOWED", "ACTION-DENIED"];
const classOf = (types: string[]) => (types.includes("DENIED") ? "Deny" : types.includes("ACTION-ALLOWED") ? "Allowed" : types.includes("ACTION-DENIED") ? "ActionDeny" : types.includes("READ-ONLY") ? "View" : "Full");
const byRolePage = new Map<string, string[]>();
for (const r of rows) { const k = `${r["Role"]}|${r["Page / Function"]}`; byRolePage.set(k, [...(byRolePage.get(k) ?? []), r["Check Type"]!]); }
const rules = new Map<string, Record<string, string[]>>();   // page -> class -> types
for (const [k, types] of byRolePage) { const page = k.split("|")[1]!; const t = ORDER.filter((x) => types.includes(x)); const cls = classOf(t); const m = rules.get(page) ?? {}; m[cls] = t; rules.set(page, m); }

function typesFor(page: string, level: string, isAction: boolean): string[] {
  if (isAction) return level === "Allowed" ? ["ACTION-ALLOWED"] : ["ACTION-DENIED"];
  if (level === "Deny") return ["DENIED"];
  const cls = level === "Full" ? "Full" : "View";
  const known = rules.get(page) ?? {};
  if (known[cls]) return known[cls]!;
  if (cls === "View" && known["Full"]) { const f = known["Full"]!; return f.includes("FORM VALIDATION") ? f.map((t) => (t === "FORM VALIDATION" ? "READ-ONLY" : t)) : [...f, "READ-ONLY"]; }
  if (cls === "Full" && known["View"]) return known["View"]!.filter((t) => t !== "READ-ONLY");
  return cls === "Full" ? ["NAVIGATE", "CONTENT", "SEARCH / FILTER", "PAGINATION", "FORM VALIDATION"] : ["NAVIGATE", "CONTENT", "SEARCH / FILTER", "PAGINATION", "READ-ONLY"];
}

// templates per check type: a sample row with the role and page replaced by placeholders
const sample = new Map<string, Record<string, string>>();
for (const r of rows) if (!sample.has(r["Check Type"]!)) sample.set(r["Check Type"]!, r);
const tmpl = (type: string, field: "Test Procedure" | "Expected Results", role: string, page: string, notes: string) => {
  const s = sample.get(type)!; let text = s[field]!;
  text = text.split(s["Role"]!).join(role).split(s["Page / Function"]!).join(page);
  if (type === "ACTION-ALLOWED" && field === "Test Procedure") text = `As ${role}, perform this action in a valid state.${notes ? " " + notes : ""}`;
  return text;
};

const idPrefix = new Map<string, string>(); const maxNo = new Map<string, number>();
for (const r of rows) { const m = r["Check ID"]!.match(/^(CK-[A-Z]+)-(\d+)$/)!; idPrefix.set(r["Role"]!, m[1]!); maxNo.set(r["Role"]!, Math.max(maxNo.get(r["Role"]!) ?? 0, Number(m[2]))); }
const existing = new Map(rows.map((r) => [`${r["Role"]}|${r["Page / Function"]}|${r["Check Type"]}`, r]));

const matrix = loadMatrix();
const out: Record<string, string>[] = []; const log: string[][] = [["Check ID", "Action", "Role", "Page / Function", "Check Type", "Reason"]];
const kept = new Set<string>();
for (const role of ROLES) {
  for (const m of matrix) {
    const level = m.byRole[role.label]; if (!level) continue;
    const notes = m.notes.split(/;?\s*owner decision 2026-11-01/)[0]!.trim();
    for (const type of typesFor(m.page, level, m.isAction)) {
      const key = `${role.label}|${m.page}|${type}`;
      const old = existing.get(key);
      if (old) { out.push(old); kept.add(key); continue; }
      const no = (maxNo.get(role.label) ?? 0) + 1; maxNo.set(role.label, no);
      const id = `${idPrefix.get(role.label)}-${String(no).padStart(4, "0")}`;
      const row: Record<string, string> = { "Check ID": id, Role: role.label, "Page / Function": m.page, "Check Type": type,
        "Test Procedure": tmpl(type, "Test Procedure", role.label, m.page, notes), "Expected Results": tmpl(type, "Expected Results", role.label, m.page, notes),
        "Actual Results": "", Status: "Not Executed", Remarks: "", "Executed by": "", "Executed Date": "", Automation: "Auto" };
      out.push(row); log.push([id, "added", role.label, m.page, type, `matrix says '${level}'`]);
    }
  }
}
for (const [key, r] of existing) if (!kept.has(key)) log.push([r["Check ID"]!, "removed", r["Role"]!, r["Page / Function"]!, r["Check Type"]!, "no longer applies under the current matrix"]);

const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
writeFileSync(file, "﻿" + [head!.join(","), ...out.map((r) => head!.map((h) => esc(r[h] ?? "")).join(","))].join("\r\n") + "\r\n");
if (log.length > 1) writeFileSync(join(SPEC, "03_regeneration_log.csv"), log.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n");   // a run with no change keeps the previous log
const c = (a: string) => log.filter((r) => r[1] === a).length;
console.log(`03 regenerated: ${rows.length} -> ${out.length} checks (${c("removed")} removed, ${c("added")} added, ${out.length - c("added")} kept with their IDs)`);
