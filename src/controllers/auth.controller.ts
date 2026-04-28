import { Response } from 'express';
import { userService } from '../services/user.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { asyncHandler, logger, UnauthorizedError } from '../utils';
import { sendSuccessResponse } from '../utils/responseHandler';
import { generateAccessToken, generateGuestToken } from '../utils/jwt';
import { SUBSCRIPTION_PLANS } from '../constants/subscriptions';
import crypto from 'crypto';
import { appConfig } from '../config';

export class AuthController {
  register = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { username, password, phone, email, emergencyContact } = req.body;

    // Validate that phone is provided
    if (!phone) {
      res.status(400).json({
        success: false,
        message: 'Phone number is required for registration',
      });
      return;
    }

    // Create user with pending_verification status
    const user = await userService.createUser({
      username,
      password,
      emergencyContact,
      phone,
      email,
      status: 'pending_verification',
    });

    // Generate OTP
    const otp = await userService.generatePhoneVerificationOTP(user.id);

    // Send phone verification via missed call for India, OTP SMS otherwise
    const { smsService } = await import('../services/sms.service');
    const userProfile = await userService.getUserProfile(user.id);
    const mcvNumber = process.env.EXOTEL_MCV_NUMBER;
    let verificationType: 'missed_call' | 'otp' = 'otp';

    if (userProfile.phone) {
      if (userProfile.phone.startsWith('+91') && mcvNumber) {
        verificationType = 'missed_call';
        logger.info(
          `Missed Call Verification initiated during registration for user ${user.id}`
        );
      } else {
        await smsService.sendOTP(userProfile.phone, otp);
      }
    }

    // Generate JWT token (but user can't login until verified)
    const token = generateAccessToken({
      type: 'user',
      userId: user.id,
      username: user.username,
    });

    logger.info(`User registered, OTP sent: ${user.id}`);

    sendSuccessResponse(
      res,
      201,
      'Registration successful. Please verify your phone number.',
      {
        token,
        user: {
          id: user.id,
          username: user.username,
          status: user.status,
          isPhoneVerified: false,
          createdAt: user.createdAt,
        },
        verificationType,
        mcvNumber: verificationType === 'missed_call' ? mcvNumber : undefined,
        message:
          verificationType === 'missed_call'
            ? 'Give a missed call to the verification number to activate your account.'
            : 'An OTP has been sent to your phone number. Please verify to activate your account.',
      }
    );
  });

  login = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { identifier, username, email, phone, password } = req.body;

    // Use identifier if provided, fallback to username, email or phone (legacy support)
    const loginIdentifier = identifier || username || email || phone;

    if (!loginIdentifier) {
      res.status(400).json({
        success: false,
        message: 'Username, email or phone is required',
      });
      return;
    }

    const user = await userService.authenticateUser(loginIdentifier, password);

    // Check if user is admin (admins bypass phone verification)
    const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || '')
      .split(',')
      .filter(Boolean);
    const isAdmin = ADMIN_USER_IDS.includes(user.id);

    // Generate JWT token
    const token = generateAccessToken({
      type: 'user',
      userId: user.id,
      username: user.username,
    });

    sendSuccessResponse(res, 200, 'Login successful', {
      token,
      user: {
        id: user.id,
        username: user.username,
        status: user.status,
        isPhoneVerified: isAdmin ? true : user.isPhoneVerified === 'true',
        createdAt: user.createdAt,
      },
      verification: {
        required: !isAdmin && user.isPhoneVerified !== 'true',
        hint:
          !isAdmin && user.isPhoneVerified !== 'true'
            ? 'Use POST /api/auth/resend-phone-verification to restart phone verification'
            : null,
      },
    });
  });

  changePassword = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;
      const { oldPassword, newPassword } = req.body;

      await userService.changePassword(userId, oldPassword, newPassword);

      sendSuccessResponse(res, 200, 'Password changed successfully', null);
    }
  );

  getProfile = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;

      // Get basic user profile
      const profile = await userService.getUserProfile(userId);

      // Get subscription information
      const { subscriptionService } = await import(
        '../services/subscription.service'
      );
      const subscription =
        await subscriptionService.getActiveSubscription(userId);
      const callUsage = await subscriptionService.getCallUsage(userId);

      // Get QR codes
      const { qrCodeService } = await import('../services/qrCode.service');
      const qrCodes = await qrCodeService.getUserQRCodes(userId);

      // Get chat and message usage
      const { chatSessionService } = await import(
        '../services/chatSession.service'
      );
      const { messageService } = await import('../services/message.service');
      const { DAILY_MESSAGE_LIMITS, ACTIVE_CHAT_LIMITS } = await import(
        '../constants/subscriptions'
      );

      const activeChatCount =
        await chatSessionService.getActiveChatCount(userId);
      const dailyMessageCount =
        await messageService.getDailyMessageCount(userId);

      const plan = await subscriptionService.getUserPlan(userId);
      const messageLimit = DAILY_MESSAGE_LIMITS[plan];
      const chatLimit = ACTIVE_CHAT_LIMITS[plan];

      sendSuccessResponse(res, 200, 'Profile retrieved successfully', {
        ...profile,
        subscription: subscription
          ? {
              plan: subscription.plan,
              status: subscription.status,
              startedAt: subscription.startedAt,
              expiresAt: subscription.expiresAt,
            }
          : {
              plan: SUBSCRIPTION_PLANS.FREE,
              status: 'active',
              startedAt: null,
              expiresAt: null,
            },
        qrCodes: {
          total: qrCodes.length,
          active: qrCodes.filter(qr => qr.status === 'active').length,
          codes: qrCodes.map(qr => ({
            id: qr.id,
            token: qr.token,
            imageUrl: `${appConfig.backendUrl}/api/qr-codes/image/${qr.token}`,
            status: qr.status,
            assignedAt: qr.assignedAt,
          })),
        },
        usage: {
          calls: {
            today: callUsage.used,
            limit: callUsage.limit,
            remaining: callUsage.remaining,
          },
          messages: {
            today: dailyMessageCount,
            limit: messageLimit === -1 ? 'unlimited' : messageLimit,
            remaining:
              messageLimit === -1
                ? 'unlimited'
                : Math.max(0, messageLimit - dailyMessageCount),
          },
          chats: {
            active: activeChatCount,
            limit: chatLimit === -1 ? 'unlimited' : chatLimit,
            remaining:
              chatLimit === -1
                ? 'unlimited'
                : Math.max(0, chatLimit - activeChatCount),
          },
        },
      });
    }
  );

  // Forgot Password - Request OTP via SMS
  forgotPassword = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { identifier, username, email, phone } = req.body;
      const targetIdentifier = identifier || username || email || phone;

      if (!targetIdentifier) {
        res.status(400).json({
          success: false,
          message: 'Identifier, username, email or phone is required',
        });
        return;
      }

      // Find user by identifier
      const user = await userService.getUserByIdentifier(targetIdentifier);

      if (!user) {
        // Don't reveal if user exists or not (security)
        sendSuccessResponse(
          res,
          200,
          'If an account exists, an OTP has been sent to the registered phone number.',
          null
        );
        return;
      }

      // Check if user has a verified phone
      if (user.isPhoneVerified !== 'true' || !user.phone) {
        res.status(400).json({
          success: false,
          message:
            'No verified phone number found for this account. Please contact support.',
        });
        return;
      }

      // Generate OTP for password reset
      const otp = await userService.generatePhoneVerificationOTP(user.id);

      // Send OTP via SMS
      const { smsService } = await import('../services/sms.service');
      const userProfile = await userService.getUserProfile(user.id);

      if (userProfile.phone) {
        await smsService.sendOTP(userProfile.phone, otp);
      }

      logger.info(`Password reset OTP sent to user: ${user.id}`);

      sendSuccessResponse(
        res,
        200,
        'OTP sent to your registered phone number.',
        {
          message:
            'An OTP has been sent to your phone. Use it to reset your password.',
          userId: user.id, // Needed for next step
        }
      );
    }
  );

  // Reset Password - Verify OTP and set new password
  resetPassword = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { userId, otp, newPassword } = req.body;

      if (!userId || !otp || !newPassword) {
        res.status(400).json({
          success: false,
          message: 'User ID, OTP, and new password are required',
        });
        return;
      }

      // Validate new password
      if (newPassword.length < 6) {
        res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters long',
        });
        return;
      }

      // Verify OTP
      try {
        await userService.verifyPhoneOTP(userId, otp);
      } catch (error) {
        res.status(400).json({
          success: false,
          message:
            error instanceof Error ? error.message : 'Invalid or expired OTP',
        });
        return;
      }

      // Change password
      await userService.resetPasswordWithUserId(userId, newPassword);

      logger.info(`Password reset successful for user: ${userId}`);

      sendSuccessResponse(
        res,
        200,
        'Password reset successful. You can now login with your new password.',
        null
      );
    }
  );

  getGuestToken = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const userAgent = req.headers['user-agent'] || 'unknown';
      const ip = req.ip || 'unknown';

      // Create a fingerprint from user agent and IP
      const fingerprint = crypto
        .createHash('sha256')
        .update(`${userAgent}-${ip}`)
        .digest('hex');

      const guestId = await userService.getOrCreateGuestId(fingerprint);
      const token = generateGuestToken(guestId);

      sendSuccessResponse(res, 200, 'Guest token generated successfully', {
        token,
        guestId,
      });
    }
  );
}

export const authController = new AuthController();
