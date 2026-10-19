import { db }    from "../db/connection.js";
import { roles } from "../db/schema/roles.js";
import { users }    from "../db/schema/users.js";
import { asc, eq }    from "drizzle-orm";

export const findAll = async () => {
  return await db.select().from(roles);
};

export const findById = async (id: number) => {
  const [role] = await db
    .select()
    .from(roles)
    .where(eq(roles.id, id));
  return role ?? null;
};

// Looked up by the role *string* (users.role / requireRole()), not the PK —
// used to reject an account being created against a role that doesn't exist.
export const findByName = async (name: string) => {
  const [role] = await db
    .select()
    .from(roles)
    .where(eq(roles.name, name));
  return role ?? null;
};

// Who holds each role. Read-only; never selects the password hash.
export const findAccountsByRole = async () => {
  return await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive })
    .from(users)
    .orderBy(asc(users.name));
};
