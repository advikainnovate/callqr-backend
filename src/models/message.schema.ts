import { pgTable, timestamp, uuid, varchar, text, boolean, json, index } from 'drizzle-orm/pg-core';
import { users } from './user.schema';
import { chatSessions } from './chatSession.schema';

export interface MessageMedia {
  publicId: string;
  url: string;
  secureUrl: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  originalFilename?: string;
  thumbnailUrl?: string;
}

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatSessionId: uuid('chat_session_id').notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  messageType: varchar('message_type', { length: 20 }).notNull().default('text'), // text, image, file, system
  content: text('content').notNull(),
  mediaAttachments: json('media_attachments').$type<MessageMedia[]>(), // Array of media objects
  isDelivered: boolean('is_delivered').default(false),
  isRead: boolean('is_read').default(false),
  isDeleted: boolean('is_deleted').default(false),
  sentAt: timestamp('sent_at').defaultNow(),
  deliveredAt: timestamp('delivered_at'),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  chatSessionIdIdx: index('messages_chat_session_id_idx').on(table.chatSessionId),
  senderIdIdx: index('messages_sender_id_idx').on(table.senderId),
  isDeliveredIdx: index('messages_is_delivered_idx').on(table.isDelivered),
  isReadIdx: index('messages_is_read_idx').on(table.isRead),
  sentAtIdx: index('messages_sent_at_idx').on(table.sentAt),
  messageTypeIdx: index('messages_message_type_idx').on(table.messageType),
}));

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
