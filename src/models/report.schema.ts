import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './user.schema';

export const reports = pgTable('reports', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(), // 'bug', 'complaint', 'feature_request', 'other'
    subject: text('subject').notNull(),
    description: text('description').notNull(),
    status: varchar('status', { length: 50 }).notNull().default('pending'), // 'pending', 'in_progress', 'resolved', 'closed'
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
