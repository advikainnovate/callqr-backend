import { eq, and, desc, gte } from 'drizzle-orm';
import { db } from '../db';
import { subscriptions, type NewSubscription, type Subscription } from '../models';
import { v4 as uuidv4 } from 'uuid';
import { logger, NotFoundError, BadRequestError, TooManyRequestsError } from '../utils';
import { userService } from './user.service';
import { SUBSCRIPTION_PLANS, DAILY_CALL_LIMITS, type SubscriptionPlan } from '../constants/subscriptions';

export class SubscriptionService {
  async createSubscription(
    userId: string,
    plan: SubscriptionPlan = SUBSCRIPTION_PLANS.FREE,
    expiresAt?: Date
  ): Promise<Subscription> {
    // Verify user exists
    await userService.getUserById(userId);

    // Check if user already has an active subscription
    const activeSubscription = await this.getActiveSubscription(userId);
    if (activeSubscription) {
      throw new BadRequestError('User already has an active subscription');
    }

    const [subscription] = await db
      .insert(subscriptions)
      .values({
        id: uuidv4(),
        userId,
        plan,
        status: 'active',
        startedAt: new Date(),
        expiresAt: expiresAt || null,
      })
      .returning();

    logger.info(`Subscription created for user ${userId}: ${plan}`);
    return subscription;
  }

  async getActiveSubscription(userId: string): Promise<Subscription | null> {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')))
      .orderBy(desc(subscriptions.startedAt))
      .limit(1);

    // Check if subscription has expired
    if (subscription && subscription.expiresAt && subscription.expiresAt < new Date()) {
      await this.expireSubscription(subscription.id);
      return null;
    }

    return subscription || null;
  }

  async getUserSubscriptions(userId: string): Promise<Subscription[]> {
    return db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.startedAt));
  }

  async upgradePlan(userId: string, newPlan: SubscriptionPlan, expiresAt?: Date): Promise<Subscription> {
    // Cancel current subscription
    const currentSubscription = await this.getActiveSubscription(userId);
    if (currentSubscription) {
      await this.cancelSubscription(currentSubscription.id);
    }

    // Create new subscription
    return this.createSubscription(userId, newPlan, expiresAt);
  }

  async cancelSubscription(subscriptionId: string): Promise<Subscription> {
    const [subscription] = await db
      .update(subscriptions)
      .set({
        status: 'canceled',
      })
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    if (!subscription) {
      throw new NotFoundError('Subscription not found');
    }

    logger.info(`Subscription canceled: ${subscriptionId}`);
    return subscription;
  }

  async expireSubscription(subscriptionId: string): Promise<Subscription> {
    const [subscription] = await db
      .update(subscriptions)
      .set({
        status: 'expired',
      })
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    if (!subscription) {
      throw new NotFoundError('Subscription not found');
    }

    logger.info(`Subscription expired: ${subscriptionId}`);
    return subscription;
  }

  async getUserPlan(userId: string): Promise<SubscriptionPlan> {
    const subscription = await this.getActiveSubscription(userId);
    return (subscription?.plan as SubscriptionPlan) || SUBSCRIPTION_PLANS.FREE;
  }

  async getDailyCallLimit(userId: string): Promise<number> {
    const plan = await this.getUserPlan(userId);
    return DAILY_CALL_LIMITS[plan];
  }

  async checkDailyCallLimit(userId: string): Promise<void> {
    const limit = await this.getDailyCallLimit(userId);
    const plan = await this.getUserPlan(userId);

    // Get today's call count
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { callSessions } = await import('../models');
    const { sql } = await import('drizzle-orm');

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(callSessions)
      .where(and(eq(callSessions.receiverId, userId), gte(callSessions.startedAt, startOfDay)));

    const callCount = Number(result.count);

    if (callCount >= limit) {
      throw new TooManyRequestsError(
        `Daily call limit reached for ${plan} plan (${callCount}/${limit})`
      );
    }
  }

  async getCallUsage(userId: string): Promise<{
    used: number;
    limit: number;
    plan: string;
    remaining: number;
  }> {
    const plan = await this.getUserPlan(userId);
    const limit = DAILY_CALL_LIMITS[plan];

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { callSessions } = await import('../models');
    const { sql } = await import('drizzle-orm');

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(callSessions)
      .where(and(eq(callSessions.receiverId, userId), gte(callSessions.startedAt, startOfDay)));

    const used = Number(result.count);

    return {
      used,
      limit,
      plan,
      remaining: Math.max(0, limit - used),
    };
  }
}

export const subscriptionService = new SubscriptionService();
