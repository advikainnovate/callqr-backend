import { pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { users } from './user.schema';

export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    platform: text('platform').notNull(),
    deviceId: text('device_id'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  table => ({
    userIdIdx: index('device_tokens_user_id_idx').on(table.userId),
    tokenIdx: index('device_tokens_token_idx').on(table.token),
  })
);

export type DeviceToken = typeof deviceTokens.$inferSelect;
export type NewDeviceToken = typeof deviceTokens.$inferInsert;
