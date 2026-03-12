import { z } from 'zod';

export const blockUserSchema = z.object({
  params: z.object({
    userId: z.string().uuid(),
  }),
  body: z.object({
    reason: z.string().max(100).optional(),
  }),
});

export const unblockUserSchema = z.object({
  params: z.object({
    userId: z.string().uuid(),
  }),
});

export const getBlockedUsersSchema = z.object({
  query: z.object({
    limit: z.string().regex(/^\d+$/).transform(Number).optional(),
    offset: z.string().regex(/^\d+$/).transform(Number).optional(),
  }),
});