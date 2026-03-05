import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { userService } from '../services/user.service';
import { smsService } from '../services/sms.service';
import { logger, BadRequestError } from '../utils';
import { z } from 'zod';

// Validation schemas
const sendOTPSchema = z.object({
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
});

const verifyOTPSchema = z.object({
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

export class PhoneVerificationController {
  /**
   * @swagger
   * /api/auth/send-phone-verification:
   *   post:
   *     summary: Send phone verification OTP
   *     tags: [Authentication]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - phone
   *             properties:
   *               phone:
   *                 type: string
   *                 example: "+1234567890"
   *     responses:
   *       200:
   *         description: OTP sent successfully
   *       400:
   *         description: Invalid phone number or already verified
   *       401:
   *         description: Unauthorized
   */
  async sendPhoneVerificationOTP(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { phone } = sendOTPSchema.parse(req.body);
      const userId = req.user?.userId;

      if (!userId) {
        throw new BadRequestError('User not authenticated');
      }

      // Get user profile with decrypted phone
      const userProfile = await userService.getUserProfile(userId);

      // If phone is provided, update it
      if (phone) {
        await userService.updateUser(userId, { phone });
      }

      // Check if phone is already verified
      const user = await userService.getUserById(userId);
      if (user.isPhoneVerified === 'true' && userProfile.phone === phone) {
        res.status(400).json({
          success: false,
          message: 'Phone number is already verified',
        });
        return;
      }

      // Generate OTP
      const otp = await userService.generatePhoneVerificationOTP(userId);

      // Get the phone to send OTP to
      const updatedProfile = await userService.getUserProfile(userId);
      const phoneToSend = phone || updatedProfile.phone;

      if (!phoneToSend) {
        throw new BadRequestError('Phone number not found');
      }

      // Send OTP via SMS
      await smsService.sendOTP(phoneToSend, otp);

      logger.info(`Phone verification OTP sent to user ${userId}`);

      res.status(200).json({
        success: true,
        message: 'Verification code sent to your phone',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.issues,
        });
        return;
      }

      logger.error('Error sending phone verification OTP:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send verification code',
      });
    }
  }

  /**
   * @swagger
   * /api/auth/verify-phone:
   *   post:
   *     summary: Verify phone number with OTP
   *     tags: [Authentication]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - otp
   *             properties:
   *               otp:
   *                 type: string
   *                 example: "123456"
   *     responses:
   *       200:
   *         description: Phone verified successfully
   *       400:
   *         description: Invalid or expired OTP
   *       401:
   *         description: Unauthorized
   */
  async verifyPhone(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { otp } = verifyOTPSchema.parse(req.body);
      const userId = req.user?.userId;

      if (!userId) {
        throw new BadRequestError('User not authenticated');
      }

      // Verify OTP
      await userService.verifyPhoneOTP(userId, otp);

      logger.info(`Phone verified successfully for user ${userId}`);

      res.status(200).json({
        success: true,
        message: 'Phone number verified successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.issues,
        });
        return;
      }

      logger.error('Error verifying phone:', error);
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to verify phone',
      });
    }
  }

  /**
   * @swagger
   * /api/auth/resend-phone-verification:
   *   post:
   *     summary: Resend phone verification OTP
   *     tags: [Authentication]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: OTP resent successfully
   *       400:
   *         description: Phone already verified or no phone number
   *       401:
   *         description: Unauthorized
   */
  async resendPhoneVerificationOTP(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        throw new BadRequestError('User not authenticated');
      }

      // Generate new OTP
      const otp = await userService.resendPhoneVerificationOTP(userId);

      // Get user's decrypted phone
      const userProfile = await userService.getUserProfile(userId);
      const phoneToSend = userProfile.phone;

      if (!phoneToSend) {
        throw new BadRequestError('Phone number not found');
      }

      // Send OTP via SMS
      await smsService.sendOTP(phoneToSend, otp);

      logger.info(`Phone verification OTP resent to user ${userId}`);

      res.status(200).json({
        success: true,
        message: 'Verification code resent to your phone',
      });
    } catch (error) {
      logger.error('Error resending phone verification OTP:', error);
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to resend verification code',
      });
    }
  }

  /**
   * @swagger
   * /api/auth/phone-verification-status:
   *   get:
   *     summary: Check phone verification status
   *     tags: [Authentication]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Phone verification status
   *       401:
   *         description: Unauthorized
   */
  async getPhoneVerificationStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        throw new BadRequestError('User not authenticated');
      }

      const user = await userService.getUserById(userId);
      const userProfile = await userService.getUserProfile(userId);

      res.status(200).json({
        success: true,
        data: {
          hasPhone: !!user.phone,
          isPhoneVerified: user.isPhoneVerified === 'true',
          phone: userProfile.phone ? userProfile.phone.replace(/(\d{2})\d+(\d{4})/, '$1****$2') : null, // Masked phone
        },
      });
    } catch (error) {
      logger.error('Error getting phone verification status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get verification status',
      });
    }
  }
}

export const phoneVerificationController = new PhoneVerificationController();
