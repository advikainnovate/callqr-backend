import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  index,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    phone: text('phone'), // Encrypted, can be decrypted for display
    email: text('email'), // Encrypted, can be decrypted for display
    phoneHash: text('phone_hash'), // SHA-256 hash for verification
    emailHash: text('email_hash'), // SHA-256 hash for verification
    emergencyContact: text('emergency_contact').notNull().default(''), // Mandatory emergency contact
    status: varchar('status', { length: 20 }).notNull().default('active'), // active, blocked, deleted
    resetPasswordToken: text('reset_password_token'), // Token for password reset
    resetPasswordExpires: timestamp('reset_password_expires'), // Expiry time for reset token
    phoneVerificationCode: text('phone_verification_code'), // Hashed OTP for phone verification
    phoneVerificationExpires: timestamp('phone_verification_expires'), // Expiry time for phone OTP
    isPhoneVerified: varchar('is_phone_verified', { length: 10 })
      .notNull()
      .default('false'), // Phone verification status
    isGloballyBlocked: varchar('is_globally_blocked', { length: 10 })
      .notNull()
      .default('false'), // Global block flag
    globalBlockReason: text('global_block_reason'), // Reason for global block
    globalBlockedAt: timestamp('global_blocked_at'), // When user was globally blocked
    globalBlockedBy: uuid('global_blocked_by'), // Admin who blocked the user
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  table => ({
    statusIdx: index('users_status_idx').on(table.status),
    resetPasswordTokenIdx: index('users_reset_password_token_idx').on(
      table.resetPasswordToken
    ),
    isGloballyBlockedIdx: index('users_is_globally_blocked_idx').on(
      table.isGloballyBlocked
    ),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
