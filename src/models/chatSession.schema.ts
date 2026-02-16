import { pgTable, timestamp, uuid, varchar, index, unique } from 'drizzle-orm/pg-core';
import { users } from './user.schema';
import { qrCodes } from './qrCode.schema';

export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  qrId: uuid('qr_id').notNull().references(() => qrCodes.id, { onDelete: 'cascade' }),
  participant1Id: uuid('participant1_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  participant2Id: uuid('participant2_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull().default('active'), // active, ended, blocked
  startedAt: timestamp('started_at').defaultNow(),
  endedAt: timestamp('ended_at'),
  lastMessageAt: timestamp('last_message_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  participant1IdIdx: index('chat_sessions_participant1_id_idx').on(table.participant1Id),
  participant2IdIdx: index('chat_sessions_participant2_id_idx').on(table.participant2Id),
  qrIdIdx: index('chat_sessions_qr_id_idx').on(table.qrId),
  statusIdx: index('chat_sessions_status_idx').on(table.status),
  lastMessageAtIdx: index('chat_sessions_last_message_at_idx').on(table.lastMessageAt),
  // Unique constraint to prevent duplicate active chats between same participants
  uniqueActiveParticipants: unique('chat_sessions_unique_active_participants').on(
    table.participant1Id, 
    table.participant2Id, 
    table.status
  ),
}));

export type ChatSession = typeof chatSessions.$inferSelect;
export type NewChatSession = typeof chatSessions.$inferInsert;
