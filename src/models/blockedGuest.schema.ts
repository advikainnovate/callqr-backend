import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './user.schema';

export const blockedGuests = pgTable(
  'blocked_guests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    guestId: text('guest_id'),
    ipAddress: text('ip_address'),
    reason: text('reason'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  table => ({
    ownerIdIdx: index('blocked_guests_owner_id_idx').on(table.ownerId),
    guestIdIdx: index('blocked_guests_guest_id_idx').on(table.guestId),
    ipAddressIdx: index('blocked_guests_ip_address_idx').on(table.ipAddress),
  })
);

export type BlockedGuest = typeof blockedGuests.$inferSelect;
export type NewBlockedGuest = typeof blockedGuests.$inferInsert;
