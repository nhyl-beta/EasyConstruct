import { desc, sql } from "drizzle-orm";

import { db } from "../../db/connection.js";
import { cashFlowEntries } from "../../db/schema/finance.js";
import { latestByCalendar } from "./months.js";

export const cashFlowRepository = {
  /**
   * The latest `months` rows by CALENDAR month (not insertion order), returned
   * oldest first. The summary's "net" card reads the last of these, so the
   * chart and the card always agree.
   */
  async findRecent(months: number = 6) {
    const rows = await db
      .select()
      .from(cashFlowEntries)
      .orderBy(desc(sql`to_date(${cashFlowEntries.month}, 'Mon YYYY')`))
      .limit(Math.max(1, Math.min(months, 60)));
    return latestByCalendar(rows, months);
  },
};
