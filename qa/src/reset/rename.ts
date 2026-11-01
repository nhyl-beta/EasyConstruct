// Renames project codes everywhere they are stored. Child tables reference a project by its code string (no foreign
// key), so changing projects.code alone leaves every task, member, document... pointing at a code that no longer exists.
import type pg from "pg";

export async function renameProjectCodes(db: pg.Client, map: Record<string, string>): Promise<Record<string, number>> {
  const cols = (await db.query(
    `select table_name, column_name from information_schema.columns
      where table_schema='public' and data_type in ('character varying','text')
        and (column_name in ('project_code','project','code') and (column_name <> 'code' or table_name = 'projects'))
        and table_name in (select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE')`,
  )).rows as { table_name: string; column_name: string }[];
  const touched: Record<string, number> = {};
  for (const { table_name: t, column_name: c } of cols) {
    for (const [from, to] of Object.entries(map)) {
      const r = await db.query(`update "${t}" set "${c}" = $1 where "${c}" = $2`, [to, from]);
      if (r.rowCount) touched[`${t}.${c}`] = (touched[`${t}.${c}`] ?? 0) + r.rowCount;
    }
  }
  return touched;
}
