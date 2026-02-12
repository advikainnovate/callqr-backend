import { pgTable, timestamp, uuid, varchar, text, boolean } from 'drizzle-orm/pg-core';
import { users } from './user.schema';
import { chatSessions } from './chatSession.schema';

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatSessionId: uuid('chat_session_id').notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  messageType: varchar('message_type', { length: 20 }).notNull().default('text'), // text, image, file, system
  content: text('content').notNull(),
  isRead: boolean('is_read').default(false),
  isDeleted: boolean('is_deleted').default(false),
  sentAt: timestamp('sent_at').defaultNow(),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
