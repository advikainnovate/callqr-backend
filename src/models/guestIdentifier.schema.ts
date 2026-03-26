import { pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';

export const guestIdentifiers = pgTable(
  'guest_identifiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fingerprint: text('fingerprint').unique().notNull(),
    guestId: uuid('guest_id').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    lastSeenAt: timestamp('last_seen_at').defaultNow(),
  },
  table => ({
    fingerprintIdx: index('guest_identifiers_fingerprint_idx').on(
      table.fingerprint
    ),
  })
);

export type GuestIdentifier = typeof guestIdentifiers.$inferSelect;
export type NewGuestIdentifier = typeof guestIdentifiers.$inferInsert;
