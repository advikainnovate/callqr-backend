import { pgTable, text, timestamp, uuid, varchar, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  phoneHash: text('phone_hash'),
  emailHash: text('email_hash'),
  emailVerified: varchar('email_verified', { length: 10 }).default('no'), // yes, no
  status: varchar('status', { length: 20 }).notNull().default('active'), // active, blocked, deleted
  blockedReason: text('blocked_reason'), // Reason for blocking
  blockedAt: timestamp('blocked_at'), // When user was blocked
  blockedBy: uuid('blocked_by'), // Admin who blocked the user
  deletedAt: timestamp('deleted_at'), // Soft delete timestamp
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  statusIdx: index('users_status_idx').on(table.status),
  createdAtIdx: index('users_created_at_idx').on(table.createdAt),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
