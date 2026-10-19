import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { procurementOrders } from "../../db/schema/finance.js";

export type ProcurementOrderRow = typeof procurementOrders.$inferSelect;
type Write = Pick<typeof db, "update" | "insert">;
type Read = Pick<typeof db, "select">;

export const procurementRepository = {
  async findById(id: string, exec: Read = db): Promise<ProcurementOrderRow | null> {
    const [row] = await exec.select().from(procurementOrders).where(eq(procurementOrders.id, id));
    return row ?? null;
  },

  async findAll(exec: Read = db): Promise<ProcurementOrderRow[]> {
    return exec.select().from(procurementOrders).orderBy(desc(procurementOrders.createdAt));
  },

  async insert(values: typeof procurementOrders.$inferInsert, exec: Write = db): Promise<ProcurementOrderRow> {
    const [row] = await exec.insert(procurementOrders).values(values).returning();
    return row!;
  },

  /** One conditional statement: undefined when the order was not in any of `from`. */
  async transition(
    id: string,
    from: readonly string[],
    patch: Partial<typeof procurementOrders.$inferInsert>,
    exec: Write = db,
  ): Promise<ProcurementOrderRow | undefined> {
    const [row] = await exec
      .update(procurementOrders)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(procurementOrders.id, id), inArray(procurementOrders.status, [...from])))
      .returning();
    return row;
  },
};
