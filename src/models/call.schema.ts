import { pgTable, serial, text, boolean, timestamp, uuid, varchar, jsonb } from 'drizzle-orm/pg-core';
import { users } from './user.schema';
import { qrCodes } from './qrCode.schema';

export const calls = pgTable('calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  callerId: uuid('caller_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  receiverId: uuid('receiver_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  qrCodeId: uuid('qr_code_id').notNull().references(() => qrCodes.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 50 }).notNull().default('initiated'), // initiated, connected, ended, failed
  callType: varchar('call_type', { length: 50 }).notNull().default('webrtc'), // webrtc, twilio
  duration: serial('duration'), // in seconds
  metadata: jsonb('metadata').$type<{
    twilioCallSid?: string;
    webrtcOffer?: any;
    webrtcAnswer?: any;
    iceCandidates?: any[];
  }>(),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type Call = typeof calls.$inferSelect;
export type NewCall = typeof calls.$inferInsert;
