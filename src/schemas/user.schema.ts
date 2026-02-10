import { z } from 'zod';

export const createUserSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(50),
    phone: z.string().optional(),
    email: z.string().email().optional(),
  }),
});

export const updateUserSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(50).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    status: z.enum(['active', 'blocked', 'deleted']).optional(),
  }),
  params: z.object({
    userId: z.string().uuid(),
  }),
});

export const getUserSchema = z.object({
  params: z.object({
    userId: z.string().uuid(),
  }),
});

export const verifyPhoneSchema = z.object({
  body: z.object({
    phone: z.string(),
  }),
});

export const verifyEmailSchema = z.object({
  body: z.object({
    email: z.string().email(),
  }),
});
