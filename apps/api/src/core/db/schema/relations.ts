// Relations defined here once all tables are built
// Example (uncomment when users + projects are linked):
// import { relations } from 'drizzle-orm';
// import { users }    from './users';
// import { projects } from './projects';
//
// export const projectRelations = relations(projects, ({ one }) => ({
//   manager: one(users, { fields: [projects.pmUserId], references: [users.id] }),
// }));