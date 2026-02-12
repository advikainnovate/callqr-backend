export const SUBSCRIPTION_PLANS = {
    FREE: 'free',
    PRO: 'pro',
    ENTERPRISE: 'enterprise',
} as const;

export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[keyof typeof SUBSCRIPTION_PLANS];

export const DAILY_CALL_LIMITS: Record<SubscriptionPlan, number> = {
    [SUBSCRIPTION_PLANS.FREE]: 20,
    [SUBSCRIPTION_PLANS.PRO]: 80,
    [SUBSCRIPTION_PLANS.ENTERPRISE]: 200,
};

export const DAILY_MESSAGE_LIMITS: Record<SubscriptionPlan, number> = {
    [SUBSCRIPTION_PLANS.FREE]: 50,
    [SUBSCRIPTION_PLANS.PRO]: 500,
    [SUBSCRIPTION_PLANS.ENTERPRISE]: -1, // unlimited
};

export const ACTIVE_CHAT_LIMITS: Record<SubscriptionPlan, number> = {
    [SUBSCRIPTION_PLANS.FREE]: 5,
    [SUBSCRIPTION_PLANS.PRO]: 20,
    [SUBSCRIPTION_PLANS.ENTERPRISE]: -1, // unlimited
};
