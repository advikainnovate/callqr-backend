import { pgTable, serial, text, boolean, timestamp, integer } from 'drizzle-orm/pg-core';

export const authSessionTokens = pgTable('auth_session_tokens', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(), // Assuming userId is a string/UUID, adjust if it's an integer reference to a Users table
  jti: text('jti').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  isUsed: boolean('is_used').default(false),
  userAgent: text('user_agent').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type AuthSessionToken = typeof authSessionTokens.$inferSelect;
export type NewAuthSessionToken = typeof authSessionTokens.$inferInsert;
