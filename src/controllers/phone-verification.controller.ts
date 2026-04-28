import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { userService } from '../services/user.service';
import { smsService } from '../services/sms.service';
import { logger, BadRequestError, UnauthorizedError } from '../utils';
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
   *     summary: Start phone verification
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
   *         description: Verification started successfully
   *       400:
   *         description: Invalid phone number or already verified
   *       401:
   *         description: Unauthorized
   */
  async sendPhoneVerificationOTP(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { phone } = sendOTPSchema.parse(req.body);
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;

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

      // Generate OTP/Expiry session
      const otp = await userService.generatePhoneVerificationOTP(userId);

      // Get the phone to verify
      const updatedProfile = await userService.getUserProfile(userId);
      const phoneToSend = phone || updatedProfile.phone;

      if (!phoneToSend) {
        throw new BadRequestError('Phone number not found');
      }

      const mcvNumber = process.env.EXOTEL_MCV_NUMBER;

      if (phoneToSend.startsWith('+91') && mcvNumber) {
        // Missed Call Verification (MCV) route for India
        logger.info(`Missed Call Verification initiated for user ${userId}`);

        res.status(200).json({
          success: true,
          message: 'Please give a missed call to verify your number.',
          mcvNumber: mcvNumber,
          verificationType: 'missed_call',
        });
      } else {
        // Send OTP via SMS for international numbers or if MCV is unconfigured
        await smsService.sendOTP(phoneToSend, otp);
        logger.info(`Phone verification OTP sent to user ${userId}`);

        res.status(200).json({
          success: true,
          message: 'Verification code sent to your phone',
          verificationType: 'otp',
        });
      }
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
        message:
          error instanceof Error
            ? error.message
            : 'Failed to send verification code',
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
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;

      // Verify OTP
      await userService.verifyPhoneOTP(userId, otp);

      // Activate user account if it was pending verification
      const user = await userService.getUserById(userId);
      if (user.status === 'pending_verification') {
        await userService.updateUser(userId, { status: 'active' });
        logger.info(
          `User account activated after phone verification: ${userId}`
        );
      }

      logger.info(`Phone verified successfully for user ${userId}`);

      res.status(200).json({
        success: true,
        message:
          'Phone number verified successfully. Your account is now active!',
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
        message:
          error instanceof Error ? error.message : 'Failed to verify phone',
      });
    }
  }

  /**
   * @swagger
   * /api/auth/resend-phone-verification:
   *   post:
   *     summary: Restart phone verification
   *     tags: [Authentication]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Verification restarted successfully
   *       400:
   *         description: Phone already verified or no phone number
   *       401:
   *         description: Unauthorized
   */
  async resendPhoneVerificationOTP(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;

      // Generate new OTP
      const otp = await userService.resendPhoneVerificationOTP(userId);

      // Get user's decrypted phone
      const userProfile = await userService.getUserProfile(userId);
      const phoneToSend = userProfile.phone;

      if (!phoneToSend) {
        throw new BadRequestError('Phone number not found');
      }

      const mcvNumber = process.env.EXOTEL_MCV_NUMBER;

      if (phoneToSend.startsWith('+91') && mcvNumber) {
        logger.info(`Missed Call Verification restarted for user ${userId}`);

        res.status(200).json({
          success: true,
          message: 'Please give a missed call to verify your number.',
          mcvNumber,
          verificationType: 'missed_call',
        });
        return;
      }

      // Send OTP via SMS for international numbers
      await smsService.sendOTP(phoneToSend, otp);

      logger.info(`Phone verification OTP resent to user ${userId}`);

      res.status(200).json({
        success: true,
        message: 'Verification code resent to your phone',
        verificationType: 'otp',
      });
    } catch (error) {
      logger.error('Error resending phone verification OTP:', error);
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to resend verification code',
      });
    }
  }

  /**
   * @swagger
   * /api/auth/exotel-webhook:
   *   post:
   *     summary: Exotel Webhook for Missed Call Verification
   *     tags: [Authentication]
   *     responses:
   *       200:
   *         description: Webhook received successfully
   */
  async handleExotelWebhook(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      // Exotel sends data as x-www-form-urlencoded
      const callerNumber = req.body.From;
      const callStatus = req.body.CallStatus; // Usually 'no-answer' or 'completed'

      if (!callerNumber) {
        res.status(400).send('Bad Request: Missing From number');
        return;
      }

      logger.info(
        `Received Exotel webhook for Missed Call from: ${callerNumber}, Status: ${callStatus}`
      );

      // Even if status is completed or no-answer, we attempt to verify
      await userService.verifyUserByMissedCall(callerNumber);

      // Always return 200 OK so Exotel doesn't retry
      res.status(200).send('Verified');
    } catch (error) {
      logger.error('Error handling Exotel webhook:', error);
      // Still send 200 so Exotel stops calling if it's an internal error
      res.status(200).send('Error Processed');
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
  async getPhoneVerificationStatus(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;

      const user = await userService.getUserById(userId);
      const userProfile = await userService.getUserProfile(userId);

      res.status(200).json({
        success: true,
        data: {
          hasPhone: !!user.phone,
          isPhoneVerified: user.isPhoneVerified === 'true',
          phone: userProfile.phone
            ? userProfile.phone.replace(/(\d{2})\d+(\d{4})/, '$1****$2')
            : null, // Masked phone
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
