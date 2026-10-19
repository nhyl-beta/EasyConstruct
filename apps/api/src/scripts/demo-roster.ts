// apps/api/src/scripts/demo-roster.ts
//
// Deterministic 50-person synthetic roster. Together with the 50 account-linked
// employee rows (which are never touched) this makes exactly 100 employees.
// All contact data is synthetic (example.com e-mails, 0900-000-xxxx phones);
// no government IDs are stored on the employees table.
//
// Upserts on employee_id and never overwrites an account-linked row
// (WHERE employees.user_id IS NULL), so it is idempotent and safe to re-run.
import type { PoolClient } from "pg";
import { DEMO_PROJECTS } from "./demo-projects.js";

/** mulberry32 — fixed-seed PRNG so every run yields the same roster. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GIVEN = [
  "Juan", "Jose", "Antonio", "Ramon", "Eduardo", "Rolando", "Danilo", "Romeo", "Alfredo", "Nestor",
  "Cesar", "Ernesto", "Rodrigo", "Benjie", "Jerome", "Kevin", "Joel", "Arnel", "Ronnie", "Manuel",
  "Maria", "Rosario", "Teresita", "Lourdes", "Maricel", "Jocelyn", "Cristina", "Imelda", "Analyn", "Glenda",
  "Marlon", "Allan", "Dennis", "Jayson", "Rommel", "Noel", "Bong", "Leonardo", "Felix", "Rene",
  "Marites", "Corazon", "Evelyn", "Nenita", "Aileen", "Ruel", "Virgilio", "Domingo", "Ignacio", "Salvador",
];
const SURNAME = [
  "Dela Cruz", "Garcia", "Reyes", "Ramos", "Aquino", "Bautista", "Villanueva", "Castillo", "Navarro", "Pascual",
  "Salazar", "Mercado", "Soriano", "Valdez", "Tolentino", "Magno", "Lacson", "Panganiban", "Evangelista", "Manalo",
  "Hernandez", "Dizon", "Alcantara", "Cabrera", "Macaraeg", "Santiago", "Robles", "Esguerra", "Liwanag", "Sarmiento",
  "Buenaventura", "Delos Santos", "Padilla", "Abad", "Guevarra", "Lorenzo", "Ilagan", "Montenegro", "Samonte", "Tañedo",
  "Caballero", "Maglaya", "Escobar", "Quizon", "Zamora", "Bonifacio", "Cortez", "Fajardo", "Gatchalian", "Hizon",
];
const MIDDLE = ["A.", "B.", "C.", "D.", "E.", "F.", "G.", "L.", "M.", "N.", "P.", "R.", "S.", "T."];

interface Trade {
  role: string;
  department: string;
  rateType: "Daily" | "Hourly" | "Monthly";
  min: number;
  max: number;
  count: number;
}

// 46 generated rows; weighted toward field trades.
const TRADES: Trade[] = [
  { role: "Laborer", department: "Field Operations", rateType: "Daily", min: 610, max: 700, count: 9 },
  { role: "Mason", department: "Field Operations", rateType: "Hourly", min: 120, max: 150, count: 5 },
  { role: "Carpenter", department: "Field Operations", rateType: "Hourly", min: 120, max: 145, count: 5 },
  { role: "Steel Fixer / Rebar Worker", department: "Field Operations", rateType: "Hourly", min: 130, max: 150, count: 4 },
  { role: "Electrician", department: "Field Operations", rateType: "Hourly", min: 150, max: 185, count: 3 },
  { role: "Plumber", department: "Field Operations", rateType: "Hourly", min: 140, max: 170, count: 3 },
  { role: "Welder", department: "Field Operations", rateType: "Hourly", min: 150, max: 175, count: 2 },
  { role: "Heavy Equipment Operator", department: "Field Operations", rateType: "Daily", min: 1100, max: 1500, count: 3 },
  { role: "Foreman", department: "Field Operations", rateType: "Daily", min: 1350, max: 1700, count: 3 },
  { role: "Site Engineer", department: "Engineering", rateType: "Monthly", min: 38000, max: 52000, count: 3 },
  { role: "Surveyor", department: "Engineering", rateType: "Monthly", min: 30000, max: 34000, count: 2 },
  { role: "Safety Officer", department: "Field Operations", rateType: "Monthly", min: 26000, max: 30000, count: 2 },
  { role: "Draftsman", department: "Design", rateType: "Monthly", min: 24000, max: 30000, count: 1 },
  { role: "Site Clerk", department: "Project Management", rateType: "Monthly", min: 19000, max: 22000, count: 1 },
  { role: "Warehouseman", department: "Field Operations", rateType: "Daily", min: 800, max: 900, count: 1 },
  { role: "Administrative Assistant", department: "Administration", rateType: "Monthly", min: 21000, max: 24000, count: 1 },
  { role: "HR Officer", department: "Human Resources", rateType: "Monthly", min: 25000, max: 29000, count: 1 },
  { role: "Accountant", department: "Finance", rateType: "Monthly", min: 29000, max: 34000, count: 1 },
];

/** The four people the brief names, exactly as written. */
const NAMED: { name: string; trade: string }[] = [
  { name: "Dirk Louisse R. Villaflor", trade: "Site Engineer" },
  { name: "Gian Carl Q. Dela Rosa", trade: "Safety Officer" },
  { name: "Mark Gabriel A. Yoldi", trade: "Foreman" },
  { name: "Nhyl Cyrus J. Gervasio", trade: "Surveyor" },
];

export interface RosterRow {
  employeeId: string;
  name: string;
  initials: string;
  role: string;
  department: string;
  site: string;
  status: string;
  attendanceRate: number;
  performance: string;
  hiredOn: string;
  email: string;
  phone: string;
  payRate: number;
  rateType: string;
}

const initialsOf = (name: string) =>
  name
    .replace(/\./g, "")
    .split(/\s+/)
    .filter((w) => /^[A-ZÑ]/.test(w) && !["Dela", "Delos"].includes(w))
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase() || "XX";

// Weighted toward the active field sites (S3–S5); S1/S2/S6/S7 get a few each.
const SITE_WEIGHTS: [string, number][] = DEMO_PROJECTS.map((p) => [
  p.name,
  ({ "DEMO-S1": 1, "DEMO-S2": 2, "DEMO-S3": 4, "DEMO-S4": 6, "DEMO-S5": 4, "DEMO-S6": 2, "DEMO-S7": 1 } as Record<string, number>)[p.code]!,
]);

export function buildRoster(): RosterRow[] {
  const rand = rng(20261004);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]!;
  const siteBag = SITE_WEIGHTS.flatMap(([s, w]) => Array<string>(w).fill(s));

  const slots: { trade: Trade; named?: string }[] = [];
  const remaining = TRADES.map((t) => ({ ...t }));
  for (const n of NAMED) {
    const t = remaining.find((x) => x.role === n.trade)!;
    t.count -= 1;
    slots.push({ trade: t, named: n.name });
  }
  for (const t of remaining) for (let i = 0; i < t.count; i++) slots.push({ trade: t });

  const usedNames = new Set<string>(NAMED.map((n) => n.name.toLowerCase()));
  const rows: RosterRow[] = [];
  slots.forEach((slot, i) => {
    const seq = i + 1;
    let name = slot.named;
    while (!name) {
      const cand = `${pick(GIVEN)} ${pick(MIDDLE)} ${pick(SURNAME)}`;
      if (!usedNames.has(cand.toLowerCase())) {
        name = cand;
        usedNames.add(cand.toLowerCase());
      }
    }
    const t = slot.trade;
    const raw = t.min + rand() * (t.max - t.min);
    const payRate = t.rateType === "Monthly" ? Math.round(raw / 500) * 500 : Math.round(raw / 5) * 5;
    // Hire dates 2018-01 .. 2026-08, inclusive of every year in between.
    const year = 2018 + Math.floor(rand() * 9);
    const month = 1 + Math.floor(rand() * (year === 2026 ? 8 : 12));
    const day = 1 + Math.floor(rand() * 28);
    const r = rand();
    // Mostly Active; a few On Leave / Inactive. Named people are always Active.
    const status = slot.named ? "Active" : r < 0.82 ? "Active" : r < 0.92 ? "On Leave" : "Inactive";
    rows.push({
      employeeId: `EMP-ROSTER-${String(seq).padStart(3, "0")}`,
      name,
      initials: initialsOf(name),
      role: t.role,
      department: t.department,
      site: pick(siteBag),
      status,
      attendanceRate: 82 + Math.floor(rand() * 18),
      performance: (3 + Math.round(rand() * 20) / 10).toFixed(1),
      hiredOn: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      email: `emp-roster-${String(seq).padStart(3, "0")}@example.com`,
      phone: `0900-000-${String(1000 + seq)}`,
      payRate,
      rateType: t.rateType,
    });
  });
  return rows;
}

/** Upsert the roster. Never touches an account-linked row (user_id IS NOT NULL). */
export async function upsertRoster(client: PoolClient): Promise<number> {
  const rows = buildRoster();
  for (const r of rows) {
    await client.query(
      `INSERT INTO employees (employee_id, name, initials, role, department, site, status, attendance_rate, performance, hired_on, email, phone, pay_rate, rate_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (employee_id) DO UPDATE SET
         name=EXCLUDED.name, initials=EXCLUDED.initials, role=EXCLUDED.role, department=EXCLUDED.department,
         site=EXCLUDED.site, status=EXCLUDED.status, attendance_rate=EXCLUDED.attendance_rate,
         performance=EXCLUDED.performance, hired_on=EXCLUDED.hired_on, email=EXCLUDED.email, phone=EXCLUDED.phone,
         pay_rate=EXCLUDED.pay_rate, rate_type=EXCLUDED.rate_type
       WHERE employees.user_id IS NULL`,
      [r.employeeId, r.name, r.initials, r.role, r.department, r.site, r.status, r.attendanceRate, r.performance, r.hiredOn, r.email, r.phone, r.payRate, r.rateType],
    );
  }
  return rows.length;
}
