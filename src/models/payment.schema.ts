import { pgTable, timestamp, uuid, varchar, integer, text, index } from 'drizzle-orm/pg-core';
import { users } from './user.schema';
import { subscriptions } from './subscription.schema';

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
  
  // Razorpay details
  razorpayOrderId: varchar('razorpay_order_id', { length: 255 }).notNull().unique(),
  razorpayPaymentId: varchar('razorpay_payment_id', { length: 255 }).unique(),
  razorpaySignature: varchar('razorpay_signature', { length: 255 }),
  
  // Payment details
  amount: integer('amount').notNull(), // Amount in paise
  currency: varchar('currency', { length: 10 }).notNull().default('INR'),
  plan: varchar('plan', { length: 50 }).notNull(), // pro, enterprise
  status: varchar('status', { length: 50 }).notNull().default('created'), // created, paid, failed, refunded
  
  // Additional info
  receipt: varchar('receipt', { length: 255 }),
  notes: text('notes'),
  errorCode: varchar('error_code', { length: 100 }),
  errorDescription: text('error_description'),
  
  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  paidAt: timestamp('paid_at'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('payments_user_id_idx').on(table.userId),
  razorpayOrderIdIdx: index('payments_razorpay_order_id_idx').on(table.razorpayOrderId),
  razorpayPaymentIdIdx: index('payments_razorpay_payment_id_idx').on(table.razorpayPaymentId),
  statusIdx: index('payments_status_idx').on(table.status),
  createdAtIdx: index('payments_created_at_idx').on(table.createdAt),
}));

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
