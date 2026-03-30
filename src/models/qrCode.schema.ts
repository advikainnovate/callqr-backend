import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  index,
  boolean,
} from 'drizzle-orm/pg-core';
import { users } from './user.schema';

export const qrCodes = pgTable(
  'qr_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: varchar('token', { length: 255 }).notNull().unique(),
    humanToken: varchar('human_token', { length: 20 }).notNull().unique(),
    assignedUserId: uuid('assigned_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: varchar('status', { length: 20 }).notNull().default('unassigned'), // unassigned, active, disabled, revoked
    redirectUrl: text('redirect_url'),
    isRedirectEnabled: boolean('is_redirect_enabled').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow(),
    assignedAt: timestamp('assigned_at'),
  },
  table => ({
    tokenIdx: index('qr_codes_token_idx').on(table.token),
    humanTokenIdx: index('qr_codes_human_token_idx').on(table.humanToken),
    assignedUserIdIdx: index('qr_codes_assigned_user_id_idx').on(
      table.assignedUserId
    ),
    statusIdx: index('qr_codes_status_idx').on(table.status),
  })
);

export type QRCode = typeof qrCodes.$inferSelect;
export type NewQRCode = typeof qrCodes.$inferInsert;
