import { Response } from 'express';
import { subscriptionService } from '../services/subscription.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { asyncHandler, BadRequestError, UnauthorizedError } from '../utils';
import { sendSuccessResponse } from '../utils/responseHandler';
import {
  SUBSCRIPTION_PLANS,
  type SubscriptionPlan,
} from '../constants/subscriptions';

export class SubscriptionController {
  createSubscription = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { userId, plan, expiresAt } = req.body;
      const expirationDate = expiresAt ? new Date(expiresAt) : undefined;

      const subscription = await subscriptionService.createSubscription(
        userId,
        plan as SubscriptionPlan,
        expirationDate
      );

      sendSuccessResponse(res, 201, 'Subscription created successfully', {
        id: subscription.id,
        userId: subscription.userId,
        plan: subscription.plan,
        status: subscription.status,
        startedAt: subscription.startedAt,
        expiresAt: subscription.expiresAt,
      });
    }
  );

  getActiveSubscription = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;
      const subscription =
        await subscriptionService.getActiveSubscription(userId);

      if (subscription) {
        sendSuccessResponse(
          res,
          200,
          'Active subscription retrieved successfully',
          {
            id: subscription.id,
            plan: subscription.plan,
            status: subscription.status,
            startedAt: subscription.startedAt,
            expiresAt: subscription.expiresAt,
          }
        );
      } else {
        sendSuccessResponse(res, 200, 'No active subscription found', {
          plan: SUBSCRIPTION_PLANS.FREE,
          status: 'active',
        });
      }
    }
  );

  getUserSubscriptions = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;
      const subscriptions =
        await subscriptionService.getUserSubscriptions(userId);

      sendSuccessResponse(
        res,
        200,
        'Subscription history retrieved successfully',
        {
          subscriptions: subscriptions.map(sub => ({
            id: sub.id,
            plan: sub.plan,
            status: sub.status,
            startedAt: sub.startedAt,
            expiresAt: sub.expiresAt,
            createdAt: sub.createdAt,
          })),
        }
      );
    }
  );

  upgradePlan = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;
      const { plan, expiresAt } = req.body;
      const expirationDate = expiresAt ? new Date(expiresAt) : undefined;

      const subscription = await subscriptionService.upgradePlan(
        userId,
        plan as SubscriptionPlan,
        expirationDate
      );

      sendSuccessResponse(res, 200, 'Plan upgraded successfully', {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        startedAt: subscription.startedAt,
        expiresAt: subscription.expiresAt,
      });
    }
  );

  downgradePlan = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;
      const { plan } = req.body;

      const subscription = await subscriptionService.downgradePlan(
        userId,
        plan as SubscriptionPlan
      );

      sendSuccessResponse(res, 200, 'Plan downgraded successfully', {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        startedAt: subscription.startedAt,
        expiresAt: subscription.expiresAt,
        message:
          'Your subscription has been downgraded. New limits will apply immediately.',
      });
    }
  );

  checkDowngradeEligibility = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;
      const { plan } = req.query;

      if (!plan) {
        throw new BadRequestError('Target plan is required');
      }

      const eligibility = await subscriptionService.getDowngradeEligibility(
        userId,
        plan as SubscriptionPlan
      );

      sendSuccessResponse(
        res,
        200,
        'Downgrade eligibility checked',
        eligibility
      );
    }
  );

  cancelSubscription = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { subscriptionId } = req.params;
      const subscription =
        await subscriptionService.cancelSubscription(subscriptionId);

      sendSuccessResponse(res, 200, 'Subscription canceled successfully', {
        id: subscription.id,
        status: subscription.status,
      });
    }
  );

  getUserPlan = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;
      const plan = await subscriptionService.getUserPlan(userId);

      sendSuccessResponse(res, 200, 'User plan retrieved successfully', {
        plan,
      });
    }
  );

  getCallUsage = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;
      const usage = await subscriptionService.getCallUsage(userId);

      sendSuccessResponse(res, 200, 'Call usage retrieved successfully', usage);
    }
  );
}

export const subscriptionController = new SubscriptionController();
