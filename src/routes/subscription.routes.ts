import { Router } from 'express';
import { subscriptionController } from '../controllers/subscription.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import {
  createSubscriptionSchema,
  upgradePlanSchema,
  downgradePlanSchema,
  getSubscriptionSchema,
  cancelSubscriptionSchema,
} from '../schemas/subscription.schema';

const router = Router();

// Create subscription (admin only - you may want to add admin middleware)
router.post('/', authenticateToken, validate(createSubscriptionSchema), subscriptionController.createSubscription);

// Get active subscription
router.get('/active', authenticateToken, subscriptionController.getActiveSubscription);

// Get subscription history
router.get('/history', authenticateToken, subscriptionController.getUserSubscriptions);

// Get user plan
router.get('/plan', authenticateToken, subscriptionController.getUserPlan);

// Get call usage
router.get('/usage', authenticateToken, subscriptionController.getCallUsage);

// Check downgrade eligibility
router.get('/downgrade/check', authenticateToken, subscriptionController.checkDowngradeEligibility);

// Upgrade plan
router.post('/upgrade', authenticateToken, validate(upgradePlanSchema), subscriptionController.upgradePlan);

// Downgrade plan
router.post('/downgrade', authenticateToken, validate(downgradePlanSchema), subscriptionController.downgradePlan);

// Cancel subscription
router.delete('/:subscriptionId', authenticateToken, validate(cancelSubscriptionSchema), subscriptionController.cancelSubscription);

export default router;
