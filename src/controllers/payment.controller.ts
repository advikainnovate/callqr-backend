import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { asyncHandler, logger } from '../utils';
import { sendSuccessResponse } from '../utils/responseHandler';
import { razorpayService } from '../services/razorpay.service';
import {
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_PRICES_DISPLAY,
} from '../constants/subscriptions';

export class PaymentController {
  /**
   * Get available subscription plans with pricing
   */
  getPlans = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const plans = [
      {
        id: SUBSCRIPTION_PLANS.FREE,
        name: 'Free',
        price: SUBSCRIPTION_PRICES_DISPLAY[SUBSCRIPTION_PLANS.FREE],
        features: [
          '20 calls per day',
          '50 messages per day',
          '5 active chats',
          'Basic support',
        ],
      },
      {
        id: SUBSCRIPTION_PLANS.PRO,
        name: 'Pro',
        price: SUBSCRIPTION_PRICES_DISPLAY[SUBSCRIPTION_PLANS.PRO],
        duration: '30 days',
        features: [
          '80 calls per day',
          '500 messages per day',
          '20 active chats',
          'Priority support',
          'Advanced analytics',
        ],
      },
      {
        id: SUBSCRIPTION_PLANS.ENTERPRISE,
        name: 'Enterprise',
        price: SUBSCRIPTION_PRICES_DISPLAY[SUBSCRIPTION_PLANS.ENTERPRISE],
        duration: '30 days',
        features: [
          '200 calls per day',
          'Unlimited messages',
          'Unlimited active chats',
          '24/7 premium support',
          'Advanced analytics',
          'Custom integrations',
        ],
      },
    ];

    sendSuccessResponse(res, 200, 'Subscription plans retrieved successfully', {
      plans,
    });
  });

  /**
   * Create a Razorpay order for subscription purchase
   */
  createOrder = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const userId = req.user!.userId;
      const { plan } = req.body;

      const order = await razorpayService.createOrder(userId, plan);

      sendSuccessResponse(res, 201, 'Payment order created successfully', {
        orderId: order.orderId,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
      });
    }
  );

  /**
   * Verify payment and activate subscription
   */
  verifyPayment = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
        req.body;

      const payment = await razorpayService.handlePaymentSuccess(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      );

      sendSuccessResponse(
        res,
        200,
        'Payment verified and subscription activated',
        {
          paymentId: payment.razorpayPaymentId,
          status: payment.status,
          plan: payment.plan,
        }
      );
    }
  );

  /**
   * Handle payment failure
   */
  paymentFailed = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { razorpay_order_id, error_code, error_description } = req.body;

      const payment = await razorpayService.handlePaymentFailure(
        razorpay_order_id,
        error_code,
        error_description
      );

      sendSuccessResponse(res, 200, 'Payment failure recorded', {
        orderId: payment.razorpayOrderId,
        status: payment.status,
      });
    }
  );

  /**
   * Get user's payment history
   */
  getPaymentHistory = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const userId = req.user!.userId;

      const payments = await razorpayService.getUserPayments(userId);

      sendSuccessResponse(res, 200, 'Payment history retrieved successfully', {
        payments: payments.map(p => ({
          id: p.id,
          orderId: p.razorpayOrderId,
          paymentId: p.razorpayPaymentId,
          amount: p.amount,
          currency: p.currency,
          plan: p.plan,
          status: p.status,
          createdAt: p.createdAt,
          paidAt: p.paidAt,
        })),
      });
    }
  );

  /**
   * Razorpay webhook handler
   */
  handleWebhook = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const signature = req.headers['x-razorpay-signature'] as string;
      const body = JSON.stringify(req.body);

      // Verify webhook signature
      const isValid = razorpayService.verifyWebhookSignature(body, signature);

      if (!isValid) {
        return res.status(400).json({ error: 'Invalid signature' });
      }

      const event = req.body.event;
      const payload = req.body.payload.payment.entity;

      switch (event) {
        case 'payment.captured':
          // Payment successful
          await razorpayService.handlePaymentSuccess(
            payload.order_id,
            payload.id,
            '' // Signature already verified
          );
          break;

        case 'payment.failed':
          // Payment failed
          await razorpayService.handlePaymentFailure(
            payload.order_id,
            payload.error_code,
            payload.error_description
          );
          break;

        default:
          // Log unhandled webhook events for monitoring
          logger.info(`Unhandled webhook event: ${event}`);
      }

      res.status(200).json({ status: 'ok' });
    }
  );
}

export const paymentController = new PaymentController();
