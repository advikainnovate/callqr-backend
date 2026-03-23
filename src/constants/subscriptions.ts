export const SUBSCRIPTION_PLANS = {
  FREE: 'free',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
} as const;

export type SubscriptionPlan =
  (typeof SUBSCRIPTION_PLANS)[keyof typeof SUBSCRIPTION_PLANS];

export const DAILY_CALL_LIMITS: Record<SubscriptionPlan, number> = {
  [SUBSCRIPTION_PLANS.FREE]: 50,
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

// Pricing in INR (paise - 1 INR = 100 paise)
export const SUBSCRIPTION_PRICES: Record<SubscriptionPlan, number> = {
  [SUBSCRIPTION_PLANS.FREE]: 0,
  [SUBSCRIPTION_PLANS.PRO]: 49900, // ₹499
  [SUBSCRIPTION_PLANS.ENTERPRISE]: 149900, // ₹1499
};

// Pricing display (for UI)
export const SUBSCRIPTION_PRICES_DISPLAY: Record<SubscriptionPlan, string> = {
  [SUBSCRIPTION_PLANS.FREE]: '₹0',
  [SUBSCRIPTION_PLANS.PRO]: '₹499',
  [SUBSCRIPTION_PLANS.ENTERPRISE]: '₹1499',
};

// Subscription duration in days
export const SUBSCRIPTION_DURATION_DAYS: Record<SubscriptionPlan, number> = {
  [SUBSCRIPTION_PLANS.FREE]: 0, // No expiry
  [SUBSCRIPTION_PLANS.PRO]: 30, // 30 days
  [SUBSCRIPTION_PLANS.ENTERPRISE]: 30, // 30 days
};
