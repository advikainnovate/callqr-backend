import { pgTable, text, timestamp, uuid, varchar, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './user.schema';

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(), // login, logout, password_change, admin_action, etc.
  resource: varchar('resource', { length: 100 }), // user, qr_code, call, chat, etc.
  resourceId: uuid('resource_id'), // ID of the affected resource
  ipAddress: varchar('ip_address', { length: 45 }), // IPv4 or IPv6
  userAgent: text('user_agent'),
  status: varchar('status', { length: 20 }).notNull(), // success, failure, error
  details: jsonb('details'), // Additional context as JSON
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userIdIdx: index('audit_logs_user_id_idx').on(table.userId),
  actionIdx: index('audit_logs_action_idx').on(table.action),
  resourceIdx: index('audit_logs_resource_idx').on(table.resource),
  createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
}));

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
