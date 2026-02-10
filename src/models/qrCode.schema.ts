import { pgTable, text, timestamp, uuid, varchar, index } from 'drizzle-orm/pg-core';
import { users } from './user.schema';

export const qrCodes = pgTable('qr_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 20 }).notNull().default('unassigned'), // unassigned, active, disabled, revoked
  createdAt: timestamp('created_at').defaultNow(),
  assignedAt: timestamp('assigned_at'),
}, (table) => ({
  tokenIdx: index('qr_codes_token_idx').on(table.token),
}));

export type QRCode = typeof qrCodes.$inferSelect;
export type NewQRCode = typeof qrCodes.$inferInsert;
