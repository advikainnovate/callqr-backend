import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import { z } from 'zod';
import {
  guestLimiter,
  guestDailyLimiter,
} from '../middlewares/rateLimit.middleware';

const router = Router();

// Registration schema
const registerSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(50),
    password: z.string().min(6).max(100),
    phone: z.string().optional(),
    email: z.string().email().optional(),
  }),
});

// Login schema
const loginSchema = z.object({
  body: z.object({
    identifier: z.string().min(1, 'Email, Username or Phone is required'),
    password: z.string().min(1, 'Password is required'),
    // Maintain backward compatibility for older frontend versions
    username: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
  }),
});

// Change password schema
const changePasswordSchema = z.object({
  body: z.object({
    oldPassword: z.string(),
    newPassword: z.string().min(6).max(100),
  }),
});

// Forgot password schema
const forgotPasswordSchema = z.object({
  body: z.object({
    username: z.string().min(1, 'Username is required'),
  }),
});

// Reset password schema
const resetPasswordSchema = z.object({
  body: z.object({
    userId: z.string().uuid('Invalid user ID format'),
    otp: z.string().length(6, 'OTP must be 6 digits'),
    newPassword: z
      .string()
      .min(6, 'Password must be at least 6 characters')
      .max(100),
  }),
});

// Public routes
router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  authController.forgotPassword
);
router.post(
  '/reset-password',
  validate(resetPasswordSchema),
  authController.resetPassword
);

router.post(
  '/guest-token',
  guestLimiter,
  guestDailyLimiter,
  authController.getGuestToken
);

/**
 * @swagger
 * /auth/profile:
 *   get:
 *     summary: Get complete user profile
 *     description: Returns user profile with subscription info, QR codes, and usage statistics
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Profile retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     username:
 *                       type: string
 *                       example: "johndoe"
 *                     phone:
 *                       type: string
 *                       nullable: true
 *                       example: "+1234567890"
 *                     email:
 *                       type: string
 *                       nullable: true
 *                       example: "john@example.com"
 *                     status:
 *                       type: string
 *                       example: "active"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                     subscription:
 *                       type: object
 *                       properties:
 *                         plan:
 *                           type: string
 *                           enum: [FREE, PRO, ENTERPRISE]
 *                           example: "PRO"
 *                         status:
 *                           type: string
 *                           example: "active"
 *                         startedAt:
 *                           type: string
 *                           format: date-time
 *                         expiresAt:
 *                           type: string
 *                           format: date-time
 *                           nullable: true
 *                     qrCodes:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                           example: 3
 *                         active:
 *                           type: number
 *                           example: 2
 *                         codes:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               token:
 *                                 type: string
 *                               status:
 *                                 type: string
 *                               assignedAt:
 *                                 type: string
 *                                 format: date-time
 *                     usage:
 *                       type: object
 *                       properties:
 *                         calls:
 *                           type: object
 *                           properties:
 *                             today:
 *                               type: number
 *                               example: 5
 *                             limit:
 *                               type: number
 *                               example: 80
 *                             remaining:
 *                               type: number
 *                               example: 75
 *                         messages:
 *                           type: object
 *                           properties:
 *                             today:
 *                               type: number
 *                               example: 45
 *                             limit:
 *                               oneOf:
 *                                 - type: number
 *                                 - type: string
 *                               example: 500
 *                             remaining:
 *                               oneOf:
 *                                 - type: number
 *                                 - type: string
 *                               example: 455
 *                         chats:
 *                           type: object
 *                           properties:
 *                             active:
 *                               type: number
 *                               example: 3
 *                             limit:
 *                               oneOf:
 *                                 - type: number
 *                                 - type: string
 *                               example: 20
 *                             remaining:
 *                               oneOf:
 *                                 - type: number
 *                                 - type: string
 *                               example: 17
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       404:
 *         description: User not found
 */
// Protected routes
router.get('/profile', authenticateToken, authController.getProfile);
router.post(
  '/change-password',
  authenticateToken,
  validate(changePasswordSchema),
  authController.changePassword
);

export default router;
