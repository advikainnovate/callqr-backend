import { pgTable, timestamp, uuid, varchar, index, unique } from 'drizzle-orm/pg-core';
import { users } from './user.schema';

export const userBlocks = pgTable('user_blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  blockerId: uuid('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedUserId: uuid('blocked_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reason: varchar('reason', { length: 100 }), // Optional: spam, harassment, etc.
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  blockerIdIdx: index('user_blocks_blocker_id_idx').on(table.blockerId),
  blockedUserIdIdx: index('user_blocks_blocked_user_id_idx').on(table.blockedUserId),
  uniqueBlock: unique('unique_user_block').on(table.blockerId, table.blockedUserId),
}));

export type UserBlock = typeof userBlocks.$inferSelect;
export type NewUserBlock = typeof userBlocks.$inferInsert;