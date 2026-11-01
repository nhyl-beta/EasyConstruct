// qa:findings — builds qa/results/findings.md from the latest run: every Failed row grouped as
//   (a) matrix disagreement  (b) missing control  (c) wrong data  (d) crash / console error  (e) known defect
// each with its CSV ID. Reads results/latest.txt (the newest run directory) and, when present,
// results/functional-failure-classification.csv (from classify-functional) to split functional failures.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "../spec.js";

const resultsDir = join(import.meta.dirname, "..", "..", "results");
// qa:findings [dir ...] — several run folders can be given; for each row the LAST folder in which it was executed wins,
// so a targeted re-run can replace rows that failed for a reason unrelated to the app (for example a worker collision).
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : [readFileSync(join(resultsDir, "latest.txt"), "utf8").trim()];
const dir = dirs.join(" + ");
const load = (f: string) => {
  const merged = new Map<string, Record<string, string>>();
  for (const d of dirs) {
    const file = join(d, f);
    if (!existsSync(file)) continue;
    const [h, ...rows] = parseCsv(readFileSync(file, "utf8"));
    for (const r of rows) {
      const row = Object.fromEntries(h!.map((k, i) => [k, r[i] ?? ""]));
      const key = `${row["Test Case ID"]}#${row["Steps"] ?? ""}#${row["Role"] ?? ""}`;
      if (!merged.has(key) || row["Status"] !== "Not Executed") merged.set(key, row);
    }
  }
  return [...merged.values()];
};
const m01 = load("01_access_matrix.csv"), m02 = load("02_lifecycle_test_cases.csv"), m03 = load("03_role_page_checks.csv");
const crawl: any[] = dirs.flatMap((d) => (existsSync(join(d, "crawl-findings.json")) ? JSON.parse(readFileSync(join(d, "crawl-findings.json"), "utf8")) : []));
const classification = new Map<string, string>();
const clsFile = join(resultsDir, "functional-failure-classification.csv");
if (existsSync(clsFile)) { const [h, ...rs] = parseCsv(readFileSync(clsFile, "utf8")); for (const r of rs) classification.set(r[h!.indexOf("Check ID")]!, r[h!.indexOf("Classification")]!); }

type Item = { id: string; who: string; what: string; detail: string };
const groups: Record<"a" | "b" | "c" | "d" | "e", Item[]> = { a: [], b: [], c: [], d: [], e: [] };
const KNOWN = /(bug[- ]?\d+|known defect|@known|role-check-fix-pending|Projects-pagination|UserAccounts)/i;
const clean = (s: string) => s.replace(/\s+/g, " ").replace(/^\[(api|ui)\] ?/, "").replace(/ expect\(received\).*$/, "").slice(0, 190);

for (const r of m01) if (r["Status"] === "Failed") (KNOWN.test(r["Remarks"]!) ? groups.e : groups.a).push({ id: r["Test Case ID"]!, who: r["Role"]!, what: r["Objective"]!, detail: clean(r["Actual Results"]!) });
for (const r of m03) {
  if (r["Status"] !== "Failed") continue;
  const type = r["Objective"]!.split(" — ").pop()!, page = r["Objective"]!.split(" — ")[0]!, actual = clean(r["Actual Results"]!);
  const it: Item = { id: r["Test Case ID"]!, who: r["Role"]!, what: `${page} (${type})`, detail: actual };
  if (KNOWN.test(r["Remarks"]!)) { groups.e.push(it); continue; }
  const cls = classification.get(r["Test Case ID"]!);
  if (["DENIED", "READ-ONLY"].includes(type) || type.startsWith("ACTION")) groups.a.push(it);
  else if (/sidebar item/i.test(actual) || cls === "role not given the page" || cls === "matrix wrong") groups.a.push({ ...it, detail: `${actual}${cls ? ` [${cls}]` : ""}` });
  else if (/console error|failed network|failed requests/i.test(actual)) groups.d.push(it);
  else if (/not found|control missing|neither blocked|validation/i.test(actual) || cls === "control missing in app") groups.b.push(it);
  else if (cls === "selector gap in the test") groups.b.push({ ...it, detail: `${actual} [test selector gap]` });
  else groups.c.push(it);
}
for (const r of m02) {
  if (r["Status"] !== "Failed") continue;
  const it: Item = { id: `${r["Test Case ID"]} step ${r["Steps"]}`, who: r["Role"]!, what: r["Objective"]!.slice(0, 70), detail: clean(r["Actual Results"]!) };
  if (KNOWN.test(r["Remarks"]!)) groups.e.push(it); else groups.c.push(it);
}
const seen = new Map<string, Item & { n: number }>();
for (const f of crawl.filter((x) => x.kind !== "external-host")) {
  const key = `${f.role}|${f.page}|${f.kind}|${String(f.detail).replace(/\d+/g, "N").slice(0, 120)}`;
  const hit = seen.get(key);
  if (hit) hit.n++; else seen.set(key, { id: `CRAWL ${f.role} / ${f.page}`, who: f.role, what: f.kind, detail: String(f.detail).slice(0, 190), n: 1 });
}
for (const it of seen.values()) groups.d.push({ ...it, detail: it.n > 1 ? `${it.detail} (x${it.n})` : it.detail });

const external = [...new Set(crawl.filter((x) => x.kind === "external-host").map((x) => String(x.detail).split(" ")[3]))];
// Manual app findings (spec/app-findings.csv): listed once, and the crawler entries they correspond to are dropped.
const manual = existsSync(join(import.meta.dirname, "..", "..", "spec", "app-findings.csv")) ? (() => { const [h, ...rs] = parseCsv(readFileSync(join(import.meta.dirname, "..", "..", "spec", "app-findings.csv"), "utf8")); return rs.map((r) => Object.fromEntries(h!.map((k, i) => [k, r[i] ?? ""]))); })() : [];
const covered = new Set(manual.map((m) => m["Matches crawl entry"]).filter(Boolean));
groups.d = groups.d.filter((i) => ![...covered].some((c) => i.id === `CRAWL ${c}`));
for (const m of manual) (groups[(m["Group"] as keyof typeof groups) ?? "c"] ?? groups.c).push({ id: m["ID"]!, who: m["Role"]!, what: m["Area"]!, detail: m["Observed"]! });
const titles: Record<keyof typeof groups, string> = { a: "(a) Matrix disagreements", b: "(b) Missing or non-working controls", c: "(c) Wrong data / behaviour differs from the spec", d: "(d) Crashes, console errors, failed requests", e: "(e) Known defects (tagged, stay Failed)" };
const lines = [`# QA findings`, ``, `Run: \`${dir}\`  `, `Failed rows: ${Object.values(groups).reduce((n, g) => n + g.length, 0)} (a ${groups.a.length}, b ${groups.b.length}, c ${groups.c.length}, d ${groups.d.length}, e ${groups.e.length})`, ``];
for (const k of ["a", "b", "c", "d", "e"] as const) {
  lines.push(`## ${titles[k]} — ${groups[k].length}`, ``);
  if (!groups[k].length) { lines.push("_none_", ""); continue; }
  lines.push("| ID | Role | What | Observed |", "|---|---|---|---|");
  for (const i of groups[k]) lines.push(`| ${i.id} | ${i.who} | ${i.what.replace(/\|/g, "/")} | ${i.detail.replace(/\|/g, "/")} |`);
  lines.push("");
}
if (external.length) lines.push("## Outside hosts the app tries to reach (information)", "", ...external.map((h) => `- ${h}`), "");
writeFileSync(join(resultsDir, "findings.md"), lines.join("\n"));
console.log(`findings.md written: a ${groups.a.length}, b ${groups.b.length}, c ${groups.c.length}, d ${groups.d.length}, e ${groups.e.length}`);
