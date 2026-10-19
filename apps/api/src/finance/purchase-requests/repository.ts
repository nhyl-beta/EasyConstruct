import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { purchaseRequests } from "../../db/schema/finance.js";

export type PurchaseRequestRow = typeof purchaseRequests.$inferSelect;
type Write = Pick<typeof db, "update" | "insert">;
type Read = Pick<typeof db, "select">;

export const purchaseRequestsRepository = {
  async findById(id: string, exec: Read = db): Promise<PurchaseRequestRow | null> {
    const [row] = await exec.select().from(purchaseRequests).where(eq(purchaseRequests.id, id));
    return row ?? null;
  },

  async findAll(exec: Read = db): Promise<PurchaseRequestRow[]> {
    return exec.select().from(purchaseRequests).orderBy(desc(purchaseRequests.requestedAt));
  },

  /** Requests for one requirement still waiting or waiting to be ordered (an ordered one is covered by its order). */
  async findLiveForRequirement(requirementId: number, exec: Read = db): Promise<PurchaseRequestRow[]> {
    return exec
      .select()
      .from(purchaseRequests)
      .where(
        and(
          eq(purchaseRequests.requirementId, requirementId),
          inArray(purchaseRequests.status, ["pending-pm", "pending-finance", "approved"]),
        ),
      );
  },

  async findLiveForProjects(projectCodes: string[], exec: Read = db): Promise<PurchaseRequestRow[]> {
    if (projectCodes.length === 0) return [];
    return exec.select().from(purchaseRequests).where(inArray(purchaseRequests.project, projectCodes));
  },

  async insert(values: typeof purchaseRequests.$inferInsert, exec: Write = db): Promise<PurchaseRequestRow> {
    const [row] = await exec.insert(purchaseRequests).values(values).returning();
    return row!;
  },

  /**
   * Moves a request out of one of the `from` statuses in a single conditional
   * statement, so two concurrent clicks cannot both win. Undefined when it was
   * no longer in any of them; the caller turns that into a 409.
   */
  async transition(
    id: string,
    from: readonly string[],
    patch: Partial<typeof purchaseRequests.$inferInsert>,
    exec: Write = db,
  ): Promise<PurchaseRequestRow | undefined> {
    const [row] = await exec
      .update(purchaseRequests)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(purchaseRequests.id, id), inArray(purchaseRequests.status, [...from])))
      .returning();
    return row;
  },
};
