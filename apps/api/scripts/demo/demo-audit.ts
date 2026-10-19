import { assertDemoEnvironment } from "./demo-guard.js";
assertDemoEnvironment();

// apps/api/scripts/demo/demo-audit.ts
//
// READ-ONLY audit used before the clean-slate reset (Part 0 / E0): real FK map
// from information_schema, row counts for every table, account <-> employee
// linkage, and the four named people. Changes nothing.
import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const q = async <T = any>(sql: string) => (await pool.query(sql)).rows as T[];

  const fks = await q(`
    SELECT tc.table_name AS tbl, kcu.column_name AS col, ccu.table_name AS ref, ccu.column_name AS refcol, rc.delete_rule AS on_delete
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' ORDER BY ref, tbl`);
  console.log("== FOREIGN KEYS (child.col -> parent.col, on delete)");
  for (const f of fks) console.log(`${f.tbl}.${f.col} -> ${f.ref}.${f.refcol} [${f.on_delete}]`);

  const cols = await q(`
    SELECT table_name AS tbl, column_name AS col FROM information_schema.columns
    WHERE table_schema='public' AND (column_name ~ '(project_code|project_id|projectcode|^project$)' OR column_name='employee_id' OR column_name ~ 'employee')
    ORDER BY 1,2`);
  console.log("\n== LOOSE project/employee reference columns");
  for (const c of cols) console.log(`${c.tbl}.${c.col}`);

  const tables = await q<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1`);
  console.log("\n== ROW COUNTS");
  for (const t of tables) {
    const r = await q(`SELECT count(*)::int AS n FROM "${t.tablename}"`);
    console.log(`${t.tablename}\t${r[0].n}`);
  }

  console.log("\n== ACCOUNTS (users) and linked employees");
  console.table(await q(`SELECT u.id, u.email, u.role, e.id AS emp_pk, e.employee_id, e.name, e.site, e.status FROM users u LEFT JOIN employees e ON e.user_id = u.id ORDER BY u.id`));
  console.log("employees with user_id:", (await q(`SELECT count(*)::int n FROM employees WHERE user_id IS NOT NULL`))[0].n);
  console.log("\n== Four named people");
  console.table(await q(`SELECT id, employee_id, name, user_id FROM employees WHERE name ~* '(villaflor|dela rosa|yoldi|gervasio)'`));
  console.log("\n== employees by status/site (before)");
  console.table(await q(`SELECT status, count(*)::int n FROM employees GROUP BY 1`));
  console.table(await q(`SELECT department, count(*)::int n FROM employees GROUP BY 1 ORDER BY 2 DESC`));
  console.table(await q(`SELECT employee_id FROM employees ORDER BY id LIMIT 5`));
  console.log("\n== projects");
  console.table(await q(`SELECT id, code, name, phase, status FROM projects ORDER BY id`).catch(() => []));
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
