import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users } from "../db/schema/users.js";

export const findSessionState = async (id: number) => {
  const [row] = await db
    .select({
      passwordChangedAt: users.passwordChangedAt,
      tokensValidAfter: users.tokensValidAfter,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, id));
  return row
    ? {
        changedAt: row.passwordChangedAt ?? null,
        validAfter: row.tokensValidAfter ?? null,
        isActive: row.isActive,
      }
    : undefined;
};
