import {
  pgTable,
  timestamp,
  uuid,
  varchar,
  integer,
  index,
  text,
} from 'drizzle-orm/pg-core';
import { users } from './user.schema';

export const qrBatches = pgTable(
  'qr_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchNumber: varchar('batch_number', { length: 50 }).notNull().unique(),
    purpose: varchar('purpose', { length: 20 }).notNull(), // printing, digital
    status: varchar('status', { length: 30 }).notNull(), // generated, print_pending, printed, distributed, available, partially_assigned, fully_assigned
    quantity: integer('quantity').notNull(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    printJobRef: varchar('print_job_ref', { length: 100 }),
    distributedAt: timestamp('distributed_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  table => ({
    batchNumberIdx: index('qr_batches_batch_number_idx').on(table.batchNumber),
    purposeIdx: index('qr_batches_purpose_idx').on(table.purpose),
    statusIdx: index('qr_batches_status_idx').on(table.status),
    createdByIdx: index('qr_batches_created_by_idx').on(table.createdBy),
  })
);

export type QRBatch = typeof qrBatches.$inferSelect;
export type NewQRBatch = typeof qrBatches.$inferInsert;
