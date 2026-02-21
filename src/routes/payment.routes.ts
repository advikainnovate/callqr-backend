import { Router } from 'express';
import { paymentController } from '../controllers/payment.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createOrderSchema = z.object({
  body: z.object({
    plan: z.enum(['pro', 'enterprise']),
  }),
});

const verifyPaymentSchema = z.object({
  body: z.object({
    razorpay_order_id: z.string(),
    razorpay_payment_id: z.string(),
    razorpay_signature: z.string(),
  }),
});

const paymentFailedSchema = z.object({
  body: z.object({
    razorpay_order_id: z.string(),
    error_code: z.string().optional(),
    error_description: z.string().optional(),
  }),
});

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Payment and subscription management with Razorpay
 */

/**
 * @swagger
 * /payments/plans:
 *   get:
 *     summary: Get available subscription plans
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription plans retrieved successfully
 */
router.get('/plans', authenticateToken, paymentController.getPlans);

/**
 * @swagger
 * /payments/create-order:
 *   post:
 *     summary: Create a Razorpay order for subscription
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - plan
 *             properties:
 *               plan:
 *                 type: string
 *                 enum: [pro, enterprise]
 *                 example: pro
 *     responses:
 *       201:
 *         description: Payment order created successfully
 */
router.post('/create-order', authenticateToken, validate(createOrderSchema), paymentController.createOrder);

/**
 * @swagger
 * /payments/verify:
 *   post:
 *     summary: Verify payment and activate subscription
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - razorpay_order_id
 *               - razorpay_payment_id
 *               - razorpay_signature
 *             properties:
 *               razorpay_order_id:
 *                 type: string
 *               razorpay_payment_id:
 *                 type: string
 *               razorpay_signature:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment verified and subscription activated
 */
router.post('/verify', authenticateToken, validate(verifyPaymentSchema), paymentController.verifyPayment);

/**
 * @swagger
 * /payments/failed:
 *   post:
 *     summary: Record payment failure
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - razorpay_order_id
 *             properties:
 *               razorpay_order_id:
 *                 type: string
 *               error_code:
 *                 type: string
 *               error_description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment failure recorded
 */
router.post('/failed', authenticateToken, validate(paymentFailedSchema), paymentController.paymentFailed);

/**
 * @swagger
 * /payments/history:
 *   get:
 *     summary: Get user's payment history
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment history retrieved successfully
 */
router.get('/history', authenticateToken, paymentController.getPaymentHistory);

/**
 * @swagger
 * /payments/webhook:
 *   post:
 *     summary: Razorpay webhook endpoint
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 */
router.post('/webhook', paymentController.handleWebhook);

export default router;
