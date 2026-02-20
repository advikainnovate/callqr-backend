import { pgTable, text, timestamp, uuid, varchar, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  phone: text('phone'), // Encrypted, can be decrypted for display
  email: text('email'), // Encrypted, can be decrypted for display
  phoneHash: text('phone_hash'), // SHA-256 hash for verification
  emailHash: text('email_hash'), // SHA-256 hash for verification
  status: varchar('status', { length: 20 }).notNull().default('active'), // active, blocked, deleted
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  statusIdx: index('users_status_idx').on(table.status),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
