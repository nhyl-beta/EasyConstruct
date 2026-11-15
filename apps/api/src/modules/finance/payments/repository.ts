import { desc, inArray, sql } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { clientPayments } from "../../../core/db/schema/finance.js";
import { nextId } from "../purchasing/ids.js";
import type { WriteExecutor } from "../cash-flow/service.js";
import type { CreateClientPaymentInput } from "./types.js";

export const clientPaymentsRepository = {
  /** Newest first. `codes` restricts to those project codes (undefined = no restriction). */
  async list(codes?: string[]) {
    if (codes && codes.length === 0) return [];
    return db
      .select()
      .from(clientPayments)
      .where(codes ? inArray(clientPayments.project, codes) : sql`true`)
      .orderBy(desc(clientPayments.receivedAt));
  },

  async create(input: CreateClientPaymentInput & { createdBy: string | null }, exec: WriteExecutor = db) {
    const id = await nextId("PAY", exec);
    const [row] = await exec
      .insert(clientPayments)
      .values({ id, project: input.project, amount: input.amount, note: input.note ?? null, createdBy: input.createdBy })
      .returning();
    return row;
  },
};
