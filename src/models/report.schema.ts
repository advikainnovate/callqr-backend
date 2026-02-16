import { pgTable, text, timestamp, uuid, varchar, index } from 'drizzle-orm/pg-core';
import { users } from './user.schema';

export const bugReports = pgTable('bug_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  description: text('description').notNull(),
  severity: varchar('severity', { length: 20 }).notNull().default('medium'), // low, medium, high, critical
  status: varchar('status', { length: 20 }).notNull().default('open'), // open, in_progress, resolved
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userIdIdx: index('bug_reports_user_id_idx').on(table.userId),
  severityIdx: index('bug_reports_severity_idx').on(table.severity),
  statusIdx: index('bug_reports_status_idx').on(table.status),
  createdAtIdx: index('bug_reports_created_at_idx').on(table.createdAt),
}));

export type BugReport = typeof bugReports.$inferSelect;
export type NewBugReport = typeof bugReports.$inferInsert;
