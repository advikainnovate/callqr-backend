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

  async downgradePlan(userId: string, newPlan: SubscriptionPlan): Promise<Subscription> {
    const currentSubscription = await this.getActiveSubscription(userId);
    
    if (!currentSubscription) {
      throw new BadRequestError('No active subscription to downgrade');
    }

    const currentPlan = currentSubscription.plan as SubscriptionPlan;

    // Validate downgrade is actually a downgrade
    const planHierarchy = {
      [SUBSCRIPTION_PLANS.FREE]: 0,
      [SUBSCRIPTION_PLANS.PRO]: 1,
      [SUBSCRIPTION_PLANS.ENTERPRISE]: 2,
    };

    if (planHierarchy[newPlan] >= planHierarchy[currentPlan]) {
      throw new BadRequestError('New plan must be lower than current plan. Use upgrade endpoint for upgrades.');
    }

    // Check if user can downgrade based on current usage
    await this.validateDowngrade(userId, newPlan);

    // Cancel current subscription
    await this.cancelSubscription(currentSubscription.id);

    // Create new subscription (FREE plan has no expiry)
    const expiresAt = newPlan === SUBSCRIPTION_PLANS.FREE ? undefined : undefined;
    const newSubscription = await this.createSubscription(userId, newPlan, expiresAt);

    logger.info(`User ${userId} downgraded from ${currentPlan} to ${newPlan}`);
    return newSubscription;
  }

  async validateDowngrade(userId: string, newPlan: SubscriptionPlan): Promise<void> {
    const { DAILY_MESSAGE_LIMITS, ACTIVE_CHAT_LIMITS } = await import('../constants/subscriptions');
    const { chatSessionService } = await import('./chatSession.service');
    const { messageService } = await import('./message.service');

    // Get new plan limits
    const newCallLimit = DAILY_CALL_LIMITS[newPlan];
    const newMessageLimit = DAILY_MESSAGE_LIMITS[newPlan];
    const newChatLimit = ACTIVE_CHAT_LIMITS[newPlan];

    // Check current usage
    const callUsage = await this.getCallUsage(userId);
    const activeChatCount = await chatSessionService.getActiveChatCount(userId);
    const dailyMessageCount = await messageService.getDailyMessageCount(userId);

    const warnings: string[] = [];

    // Check if current usage exceeds new limits
    if (callUsage.used > newCallLimit) {
      warnings.push(`You have already used ${callUsage.used} calls today, which exceeds the ${newPlan} plan limit of ${newCallLimit} calls/day.`);
    }

    if (newMessageLimit !== -1 && dailyMessageCount > newMessageLimit) {
      warnings.push(`You have sent ${dailyMessageCount} messages today, which exceeds the ${newPlan} plan limit of ${newMessageLimit} messages/day.`);
    }

    if (newChatLimit !== -1 && activeChatCount > newChatLimit) {
      warnings.push(`You have ${activeChatCount} active chats, which exceeds the ${newPlan} plan limit of ${newChatLimit} active chats.`);
    }

    // If there are warnings, throw error with details
    if (warnings.length > 0) {
      throw new BadRequestError(
        `Cannot downgrade: Current usage exceeds new plan limits. ${warnings.join(' ')}`
      );
    }
  }

  async getDowngradeEligibility(userId: string, targetPlan: SubscriptionPlan): Promise<{
    eligible: boolean;
    currentPlan: string;
    targetPlan: string;
    warnings: string[];
    currentUsage: {
      calls: { used: number; newLimit: number };
      messages: { used: number; newLimit: number | string };
      chats: { active: number; newLimit: number | string };
    };
  }> {
    const currentSubscription = await this.getActiveSubscription(userId);
    const currentPlan = currentSubscription?.plan as SubscriptionPlan || SUBSCRIPTION_PLANS.FREE;

    const { DAILY_MESSAGE_LIMITS, ACTIVE_CHAT_LIMITS } = await import('../constants/subscriptions');
    const { chatSessionService } = await import('./chatSession.service');
    const { messageService } = await import('./message.service');

    // Get new plan limits
    const newCallLimit = DAILY_CALL_LIMITS[targetPlan];
    const newMessageLimit = DAILY_MESSAGE_LIMITS[targetPlan];
    const newChatLimit = ACTIVE_CHAT_LIMITS[targetPlan];

    // Get current usage
    const callUsage = await this.getCallUsage(userId);
    const activeChatCount = await chatSessionService.getActiveChatCount(userId);
    const dailyMessageCount = await messageService.getDailyMessageCount(userId);

    const warnings: string[] = [];
    let eligible = true;

    // Check if current usage exceeds new limits
    if (callUsage.used > newCallLimit) {
      warnings.push(`Current calls today (${callUsage.used}) exceeds ${targetPlan} limit (${newCallLimit})`);
      eligible = false;
    }

    if (newMessageLimit !== -1 && dailyMessageCount > newMessageLimit) {
      warnings.push(`Current messages today (${dailyMessageCount}) exceeds ${targetPlan} limit (${newMessageLimit})`);
      eligible = false;
    }

    if (newChatLimit !== -1 && activeChatCount > newChatLimit) {
      warnings.push(`Current active chats (${activeChatCount}) exceeds ${targetPlan} limit (${newChatLimit})`);
      eligible = false;
    }

    return {
      eligible,
      currentPlan,
      targetPlan,
      warnings,
      currentUsage: {
        calls: { used: callUsage.used, newLimit: newCallLimit },
        messages: { used: dailyMessageCount, newLimit: newMessageLimit === -1 ? 'unlimited' : newMessageLimit },
        chats: { active: activeChatCount, newLimit: newChatLimit === -1 ? 'unlimited' : newChatLimit },
      },
    };
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
