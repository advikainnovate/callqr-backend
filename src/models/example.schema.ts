import { pgTable, serial, text, boolean, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';

export const examples = pgTable('examples', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  isDeleted: boolean('is_deleted').default(false),
  tags: text('tags').array().default([]),
  price: integer('price').notNull(),
  metadata: jsonb('metadata').$type<{
    category: string;
    priority: 'low' | 'medium' | 'high';
    createdAt: string;
  }>(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type Example = typeof examples.$inferSelect;
export type NewExample = typeof examples.$inferInsert;
