import { z } from 'zod';

export const createUserSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(50),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    emergencyContact: z.string().min(1, 'Emergency contact is required'),
  }),
});

export const updateUserSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(50).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    emergencyContact: z.string().optional(),
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

export const upsertDeviceTokenSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Token is required'),
    platform: z.enum(['android', 'ios', 'web']).default('android'),
    deviceId: z.string().optional(),
  }),
});

export const removeDeviceTokenSchema = z.object({
  params: z.object({
    token: z.string(),
  }),
});
