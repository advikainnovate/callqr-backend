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

    // Validate that email is provided
    if (!email) {
      res.status(400).json({
        success: false,
        message: 'Email is required for registration',
      });
      return;
    }

    const user = await userService.createUser({
      username,
      password,
      emergencyContact,
      phone,
      email,
      status: 'pending_verification',
    });

    const otp = await userService.generateEmailVerificationOTP(user.id);
    const { emailService } = await import('../services/email.service');
    await emailService.sendVerificationOTP(email, otp);

    const token = generateAccessToken({
      type: 'user',
      userId: user.id,
      username: user.username,
    });

    logger.info(`User registered and email verification sent: ${user.id}`);

    sendSuccessResponse(
      res,
      201,
      'Registration successful. Please verify your email.',
      {
        token,
        user: {
          id: user.id,
          username: user.username,
          status: user.status,
          isEmailVerified: false,
          createdAt: user.createdAt,
        },
        verification: {
          required: true,
          type: 'email',
          hint: 'Use POST /api/auth/verify-email to complete verification',
        },
      }
    );
  });

  login = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { identifier, username, email, password } = req.body;

    const loginIdentifier = identifier || username || email;

    if (!loginIdentifier) {
      res.status(400).json({
        success: false,
        message: 'Username or email is required',
      });
      return;
    }

    const user = await userService.authenticateUser(loginIdentifier, password);

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
        isEmailVerified: user.isEmailVerified === 'true',
        createdAt: user.createdAt,
      },
      verification: {
        required: user.isEmailVerified !== 'true',
        hint:
          user.isEmailVerified !== 'true'
            ? 'Use POST /api/auth/resend-email-verification to restart email verification'
            : null,
      },
    });
  });

  sendEmailVerification = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }

      const userId = identity.userId;
      const { email } = req.body;
      const userProfile = await userService.getUserProfile(userId);

      if (email && email !== userProfile.email) {
        await userService.updateUser(userId, { email });
      }

      const refreshedProfile = await userService.getUserProfile(userId);
      if (!refreshedProfile.email) {
        res.status(400).json({
          success: false,
          message: 'Email not found',
        });
        return;
      }

      if (
        refreshedProfile.isEmailVerified &&
        (!email || email === userProfile.email)
      ) {
        res.status(400).json({
          success: false,
          message: 'Email is already verified',
        });
        return;
      }

      const otp = await userService.generateEmailVerificationOTP(userId);
      const { emailService } = await import('../services/email.service');
      await emailService.sendVerificationOTP(refreshedProfile.email, otp);

      sendSuccessResponse(res, 200, 'Verification code sent to your email.', {
        verificationType: 'email',
      });
    }
  );

  verifyEmail = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }

      const userId = identity.userId;
      const { otp } = req.body;

      await userService.verifyEmailOTP(userId, otp);

      const user = await userService.getUserById(userId);
      if (user.status === 'pending_verification') {
        await userService.updateUser(userId, { status: 'active' });
      }

      sendSuccessResponse(
        res,
        200,
        'Email verified successfully. Your account is now active.',
        null
      );
    }
  );

  resendEmailVerification = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }

      const userId = identity.userId;
      const otp = await userService.resendEmailVerificationOTP(userId);
      const userProfile = await userService.getUserProfile(userId);

      if (!userProfile.email) {
        res.status(400).json({
          success: false,
          message: 'Email not found',
        });
        return;
      }

      const { emailService } = await import('../services/email.service');
      await emailService.sendVerificationOTP(userProfile.email, otp);

      sendSuccessResponse(res, 200, 'Verification code resent to your email.', {
        verificationType: 'email',
      });
    }
  );

  getEmailVerificationStatus = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }

      const userId = identity.userId;
      const userProfile = await userService.getUserProfile(userId);

      res.status(200).json({
        success: true,
        data: {
          hasEmail: !!userProfile.email,
          isEmailVerified: userProfile.isEmailVerified,
          email: userProfile.email
            ? userProfile.email.replace(/(^.{2}).+(@.*$)/, '$1****$2')
            : null,
        },
      });
    }
  );

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

  // Forgot Password - Request OTP via Email
  forgotPassword = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { identifier, username, email } = req.body;
      const targetIdentifier = identifier || username || email;

      if (!targetIdentifier) {
        res.status(400).json({
          success: false,
          message: 'Identifier, username, or email is required',
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
          'If an account exists, an OTP has been sent to the registered email address.',
          null
        );
        return;
      }

      // Check if user has a verified email
      if (user.isEmailVerified !== 'true' || !user.email) {
        res.status(400).json({
          success: false,
          message:
            'No verified email found for this account. Please contact support.',
        });
        return;
      }

      // Generate OTP for password reset
      const otp = await userService.generatePasswordResetOTP(user.id);

      // Send OTP via email
      const { emailService } = await import('../services/email.service');
      const userProfile = await userService.getUserProfile(user.id);

      if (userProfile.email) {
        await emailService.sendPasswordResetOTP(userProfile.email, otp);
      }

      logger.info(`Password reset OTP emailed to user: ${user.id}`);

      sendSuccessResponse(
        res,
        200,
        'OTP sent to your registered email address.',
        {
          message:
            'An OTP has been sent to your email. Use it to reset your password.',
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
        await userService.verifyPasswordResetOTP(userId, otp);
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
