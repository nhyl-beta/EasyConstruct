// Collision-safe ids from Postgres sequences (created in migration 0025):
// PR-0001, PO-0001, EXP-0001. The old random "EXP-" + 4 digits could
// collide; nextval cannot.
import { sql } from "drizzle-orm";
import type { db } from "../../db/connection.js";

type Exec = Pick<typeof db, "execute">;

const SEQUENCES = {
  PR: "purchase_request_seq",
  PO: "procurement_order_seq",
  EXP: "expense_seq",
} as const;

export type IdPrefix = keyof typeof SEQUENCES;

/** "PR" + 7 -> "PR-0007". Wider numbers simply grow (PR-12345). */
export const formatId = (prefix: IdPrefix, n: number): string => `${prefix}-${String(n).padStart(4, "0")}`;

export async function nextId(prefix: IdPrefix, exec: Exec): Promise<string> {
  const seq = SEQUENCES[prefix];
  const result = await exec.execute(sql`select nextval(${seq}::regclass)::bigint as n`);
  const row = (result.rows as { n: string | number }[])[0];
  return formatId(prefix, Number(row!.n));
}
