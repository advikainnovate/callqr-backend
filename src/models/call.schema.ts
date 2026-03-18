import { pgTable, timestamp, uuid, varchar, index } from 'drizzle-orm/pg-core';
import { users } from './user.schema';
import { qrCodes } from './qrCode.schema';

export const callSessions = pgTable(
  'call_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    callerId: uuid('caller_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    receiverId: uuid('receiver_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    qrId: uuid('qr_id')
      .notNull()
      .references(() => qrCodes.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 }).notNull().default('initiated'), // initiated, ringing, connected, ended, failed
    endedReason: varchar('ended_reason', { length: 50 }), // busy, rejected, timeout, error
    initiatedAt: timestamp('initiated_at').defaultNow(), // when the call was first created
    startedAt: timestamp('started_at'), // when both parties connected
    endedAt: timestamp('ended_at'),
  },
  table => ({
    statusIdx: index('call_sessions_status_idx').on(table.status),
    startedAtIdx: index('call_sessions_started_at_idx').on(table.startedAt),
    callerIdIdx: index('call_sessions_caller_id_idx').on(table.callerId),
    receiverIdIdx: index('call_sessions_receiver_id_idx').on(table.receiverId),
  })
);

export type CallSession = typeof callSessions.$inferSelect;
export type NewCallSession = typeof callSessions.$inferInsert;
