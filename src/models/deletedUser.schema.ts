import { pgTable, text, timestamp, uuid, varchar, jsonb, index } from 'drizzle-orm/pg-core';

export const deletedUsers = pgTable('deleted_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  originalUserId: uuid('original_user_id').notNull().unique(),
  username: text('username').notNull(),
  userData: jsonb('user_data').notNull(), // Store full user data for recovery
  deletedAt: timestamp('deleted_at').defaultNow(),
  deletedBy: uuid('deleted_by'), // Admin who deleted, or null for self-delete
  reason: text('reason'), // Optional deletion reason
  canRecover: varchar('can_recover', { length: 10 }).notNull().default('yes'), // yes, no
  recoveryExpiresAt: timestamp('recovery_expires_at'), // After this, permanent deletion
}, (table) => ({
  originalUserIdIdx: index('deleted_users_original_user_id_idx').on(table.originalUserId),
  deletedAtIdx: index('deleted_users_deleted_at_idx').on(table.deletedAt),
  recoveryExpiresAtIdx: index('deleted_users_recovery_expires_at_idx').on(table.recoveryExpiresAt),
}));

export type DeletedUser = typeof deletedUsers.$inferSelect;
export type NewDeletedUser = typeof deletedUsers.$inferInsert;
