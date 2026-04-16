import Razorpay from 'razorpay';
import crypto from 'crypto';
import { db } from '../db';
import { payments, type NewPayment, type Payment } from '../models';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { logger, BadRequestError, NotFoundError } from '../utils';
import {
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_PRICES,
  SUBSCRIPTION_DURATION_DAYS,
  type SubscriptionPlan,
} from '../constants/subscriptions';
import { subscriptionService } from './subscription.service';

export class RazorpayService {
  private razorpay: Razorpay;

  constructor() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      logger.warn(
        'Razorpay credentials not configured. Payment features will be disabled.'
      );
      // Create a dummy instance to prevent errors
      this.razorpay = null as any;
    } else {
      this.razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });
      logger.info('Razorpay service initialized');
    }
  }

  /**
   * Create a Razorpay order for subscription purchase
   */
  async createOrder(
    userId: string,
    plan: SubscriptionPlan
  ): Promise<{
    orderId: string;
    amount: number;
    currency: string;
    receipt: string;
    payment: Payment;
  }> {
    if (!this.razorpay) {
      throw new BadRequestError('Payment service is not configured');
    }

    // Validate plan
    if (plan === SUBSCRIPTION_PLANS.FREE) {
      throw new BadRequestError('Cannot create payment for FREE plan');
    }

    if (!Object.values(SUBSCRIPTION_PLANS).includes(plan)) {
      throw new BadRequestError('Invalid subscription plan');
    }

    const amount = SUBSCRIPTION_PRICES[plan];
    const receipt = `rcpt_${uuidv4().substring(0, 8)}`;

    try {
      // Create Razorpay order
      const order = await this.razorpay.orders.create({
        amount,
        currency: 'INR',
        receipt,
        notes: {
          userId,
          plan,
          type: 'subscription',
        },
      });

      // Save payment record in database
      const [payment] = await db
        .insert(payments)
        .values({
          id: uuidv4(),
          userId,
          razorpayOrderId: order.id,
          amount,
          currency: 'INR',
          plan,
          status: 'created',
          receipt,
          notes: JSON.stringify({ plan, type: 'subscription' }),
        })
        .returning();

      logger.info(
        `Razorpay order created: ${order.id} for user ${userId}, plan ${plan}`
      );

      return {
        orderId: order.id,
        amount,
        currency: 'INR',
        receipt,
        payment,
      };
    } catch (error) {
      logger.error('Error creating Razorpay order:', error);
      throw new BadRequestError('Failed to create payment order');
    }
  }

  /**
   * Verify Razorpay payment signature
   */
  verifyPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string
  ): boolean {
    if (!this.razorpay) {
      throw new BadRequestError('Payment service is not configured');
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET!;
    const body = orderId + '|' + paymentId;

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(body)
      .digest('hex');

    return this.timingSafeHexEqual(expectedSignature, signature);
  }

  /**
   * Handle successful payment and activate subscription
   */
  async handlePaymentSuccess(
    orderId: string,
    paymentId: string,
    signature: string
  ): Promise<Payment> {
    // Verify signature
    const isValid = this.verifyPaymentSignature(orderId, paymentId, signature);

    if (!isValid) {
      logger.error(`Invalid payment signature for order ${orderId}`);
      throw new BadRequestError('Invalid payment signature');
    }

    // Get payment record
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.razorpayOrderId, orderId))
      .limit(1);

    if (!payment) {
      throw new NotFoundError('Payment record not found');
    }

    if (payment.status === 'paid') {
      logger.warn(`Payment ${orderId} already processed`);
      return payment;
    }

    try {
      // Update payment status
      const [updatedPayment] = await db
        .update(payments)
        .set({
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
          status: 'paid',
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id))
        .returning();

      // Calculate expiry date
      const plan = payment.plan as SubscriptionPlan;
      const durationDays = SUBSCRIPTION_DURATION_DAYS[plan];
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + durationDays);

      // Create or upgrade subscription
      const subscription = await subscriptionService.upgradePlan(
        payment.userId,
        plan,
        expiresAt
      );

      // Link payment to subscription
      await db
        .update(payments)
        .set({
          subscriptionId: subscription.id,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));

      logger.info(
        `Payment successful: ${paymentId}, subscription activated for user ${payment.userId}`
      );

      return updatedPayment;
    } catch (error) {
      logger.error('Error processing payment success:', error);

      // Mark payment as failed
      await db
        .update(payments)
        .set({
          status: 'failed',
          errorDescription:
            error instanceof Error ? error.message : 'Unknown error',
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));

      throw new BadRequestError('Failed to process payment');
    }
  }

  /**
   * Handle payment failure
   */
  async handlePaymentFailure(
    orderId: string,
    errorCode?: string,
    errorDescription?: string
  ): Promise<Payment> {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.razorpayOrderId, orderId))
      .limit(1);

    if (!payment) {
      throw new NotFoundError('Payment record not found');
    }

    const [updatedPayment] = await db
      .update(payments)
      .set({
        status: 'failed',
        errorCode,
        errorDescription,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id))
      .returning();

    logger.warn(`Payment failed: ${orderId}, error: ${errorCode}`);

    return updatedPayment;
  }

  /**
   * Get payment by order ID
   */
  async getPaymentByOrderId(orderId: string): Promise<Payment | null> {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.razorpayOrderId, orderId))
      .limit(1);

    return payment || null;
  }

  /**
   * Get payment by payment ID
   */
  async getPaymentByPaymentId(paymentId: string): Promise<Payment | null> {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.razorpayPaymentId, paymentId))
      .limit(1);

    return payment || null;
  }

  /**
   * Get user's payment history
   */
  async getUserPayments(userId: string): Promise<Payment[]> {
    return db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(payments.createdAt);
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(body: string, signature: string): boolean {
    if (!this.razorpay) {
      throw new BadRequestError('Payment service is not configured');
    }

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.error('Razorpay webhook secret not configured');
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    return this.timingSafeHexEqual(expectedSignature, signature);
  }

  private timingSafeHexEqual(
    expectedHex: string,
    providedHex: string | undefined
  ): boolean {
    if (!providedHex) {
      return false;
    }

    if (
      !/^[0-9a-fA-F]+$/.test(expectedHex) ||
      !/^[0-9a-fA-F]+$/.test(providedHex)
    ) {
      return false;
    }

    if (expectedHex.length !== providedHex.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(expectedHex, 'hex'),
      Buffer.from(providedHex, 'hex')
    );
  }
}

export const razorpayService = new RazorpayService();
