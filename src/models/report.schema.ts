import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './user.schema';

export const bugReports = pgTable('bug_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  description: text('description').notNull(),
  severity: varchar('severity', { length: 20 }).notNull().default('medium'), // low, medium, high, critical
  status: varchar('status', { length: 20 }).notNull().default('open'), // open, in_progress, resolved
  createdAt: timestamp('created_at').defaultNow(),
});

export type BugReport = typeof bugReports.$inferSelect;
export type NewBugReport = typeof bugReports.$inferInsert;
