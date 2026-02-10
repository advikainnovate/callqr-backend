import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './user.schema';
import { qrCodes } from './qrCode.schema';

export const callSessions = pgTable('call_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  callerId: uuid('caller_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  receiverId: uuid('receiver_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  qrId: uuid('qr_id').notNull().references(() => qrCodes.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull().default('initiated'), // initiated, ringing, connected, ended, failed
  endedReason: varchar('ended_reason', { length: 50 }), // busy, rejected, timeout, error
  startedAt: timestamp('started_at').defaultNow(),
  endedAt: timestamp('ended_at'),
});

export type CallSession = typeof callSessions.$inferSelect;
export type NewCallSession = typeof callSessions.$inferInsert;
