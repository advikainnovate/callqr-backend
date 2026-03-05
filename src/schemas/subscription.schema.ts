import { z } from 'zod';

export const createSubscriptionSchema = z.object({
  body: z.object({
    userId: z.string().uuid(),
    plan: z.enum(['free', 'pro', 'enterprise']).default('free'),
    expiresAt: z.string().datetime().optional(),
  }),
});

export const upgradePlanSchema = z.object({
  body: z.object({
    plan: z.enum(['free', 'pro', 'enterprise']),
    expiresAt: z.string().datetime().optional(),
  }),
  params: z.object({
    userId: z.string().uuid(),
  }),
});

export const downgradePlanSchema = z.object({
  body: z.object({
    plan: z.enum(['free', 'pro']), // Can only downgrade to free or pro
  }),
});

export const getSubscriptionSchema = z.object({
  params: z.object({
    userId: z.string().uuid(),
  }),
});

export const cancelSubscriptionSchema = z.object({
  params: z.object({
    subscriptionId: z.string().uuid(),
  }),
});
