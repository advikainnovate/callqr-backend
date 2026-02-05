export const SUBSCRIPTION_TIERS = {
    FREE: 'free',
    GOLD: 'gold',
    PLATINUM: 'platinum',
} as const;

export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[keyof typeof SUBSCRIPTION_TIERS];

export const DAILY_CALL_LIMITS: Record<SubscriptionTier, number> = {
    [SUBSCRIPTION_TIERS.FREE]: 20,
    [SUBSCRIPTION_TIERS.GOLD]: 80,
    [SUBSCRIPTION_TIERS.PLATINUM]: 200,
};
