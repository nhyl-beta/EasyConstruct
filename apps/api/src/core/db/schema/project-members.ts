import { pgTable, serial, varchar, integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { users } from './users.js';

// Generalized from the original engineer-only "project_engineers" table
// (EC-013/017/018/024): a PM marks any team member — engineer, architect,
// site personnel, or consultant — as staffed on a project. Architects then
// assign one of the "engineer"-role rows to a design (see
// designs.assignedEngineerId, which references users.id directly, not this
// table, so this generalization doesn't touch that relationship).
export const PROJECT_MEMBER_ROLES = ['engineer', 'architect', 'site-personnel', 'consultant'] as const;
export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number];

export const projectMembers = pgTable('project_members', {
  id: serial('id').primaryKey(),
  projectCode: varchar('project_code', { length: 50 }).notNull(),
  userId: integer('user_id').notNull().references(() => users.id),
  userName: varchar('user_name', { length: 100 }).notNull(),
  role: varchar('role', { length: 40 }).notNull(),
  addedBy: varchar('added_by', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  unique('project_members_project_user_role_unique').on(table.projectCode, table.userId, table.role),
]);

export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;
