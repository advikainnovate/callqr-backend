import { pgTable, serial, text, boolean, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  phoneNo: text('phone_no').notNull().unique(),
  emergencyNo: text('emergency_no'),
  vehicleType: text('vehicle_type', { enum: ['two_wheeler', 'four_wheeler', 'public_vehicle'] }),
  isDeleted: boolean('is_deleted').default(false),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
