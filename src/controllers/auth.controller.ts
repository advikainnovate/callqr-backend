import { Response } from 'express';
import { userService } from '../services/user.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { asyncHandler, logger } from '../utils';
import { sendSuccessResponse } from '../utils/responseHandler';
import { generateAccessToken } from '../utils/jwt';

export class AuthController {
  register = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { username, password, phone, email } = req.body;

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
      phone, 
      email,
      status: 'pending_verification' 
    });

    // Generate OTP
    const otp = await userService.generatePhoneVerificationOTP(user.id);

    // Send OTP via SMS
    const { smsService } = await import('../services/sms.service');
    const userProfile = await userService.getUserProfile(user.id);
    
    if (userProfile.phone) {
      await smsService.sendOTP(userProfile.phone, otp);
    }

    // Generate JWT token (but user can't login until verified)
    const token = generateAccessToken({ userId: user.id, username: user.username });

    logger.info(`User registered, OTP sent: ${user.id}`);

    sendSuccessResponse(res, 201, 'Registration successful. Please verify your phone number.', {
      token,
      user: {
        id: user.id,
        username: user.username,
        status: user.status,
        isPhoneVerified: false,
        createdAt: user.createdAt,
      },
      message: 'An OTP has been sent to your phone number. Please verify to activate your account.',
    });
  });

  login = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { username, password } = req.body;

    const user = await userService.authenticateUser(username, password);

    // Check if phone is verified
    if (user.isPhoneVerified !== 'true') {
      res.status(403).json({
        success: false,
        message: 'Please verify your phone number before logging in',
        data: {
          userId: user.id,
          isPhoneVerified: false,
          hint: 'Use POST /api/auth/resend-phone-verification to get a new OTP',
        },
      });
      return;
    }

    // Check if account is pending verification
    if (user.status === 'pending_verification') {
      res.status(403).json({
        success: false,
        message: 'Your account is pending phone verification',
        data: {
          userId: user.id,
          isPhoneVerified: false,
        },
      });
      return;
    }

    // Generate JWT token
    const token = generateAccessToken({ userId: user.id, username: user.username });

    sendSuccessResponse(res, 200, 'Login successful', {
      token,
      user: {
        id: user.id,
        username: user.username,
        status: user.status,
        createdAt: user.createdAt,
      },
    });
  });

  changePassword = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const { oldPassword, newPassword } = req.body;

    await userService.changePassword(userId, oldPassword, newPassword);

    sendSuccessResponse(res, 200, 'Password changed successfully', null);
  });

  getProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    
    // Get basic user profile
    const profile = await userService.getUserProfile(userId);
    
    // Get subscription information
    const { subscriptionService } = await import('../services/subscription.service');
    const subscription = await subscriptionService.getActiveSubscription(userId);
    const callUsage = await subscriptionService.getCallUsage(userId);
    
    // Get QR codes
    const { qrCodeService } = await import('../services/qrCode.service');
    const qrCodes = await qrCodeService.getUserQRCodes(userId);
    
    // Get chat and message usage
    const { chatSessionService } = await import('../services/chatSession.service');
    const { messageService } = await import('../services/message.service');
    const { DAILY_MESSAGE_LIMITS, ACTIVE_CHAT_LIMITS } = await import('../constants/subscriptions');
    
    const activeChatCount = await chatSessionService.getActiveChatCount(userId);
    const dailyMessageCount = await messageService.getDailyMessageCount(userId);
    
    const plan = await subscriptionService.getUserPlan(userId);
    const messageLimit = DAILY_MESSAGE_LIMITS[plan];
    const chatLimit = ACTIVE_CHAT_LIMITS[plan];

    sendSuccessResponse(res, 200, 'Profile retrieved successfully', {
      ...profile,
      subscription: subscription ? {
        plan: subscription.plan,
        status: subscription.status,
        startedAt: subscription.startedAt,
        expiresAt: subscription.expiresAt,
      } : {
        plan: 'FREE',
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
          remaining: messageLimit === -1 ? 'unlimited' : Math.max(0, messageLimit - dailyMessageCount),
        },
        chats: {
          active: activeChatCount,
          limit: chatLimit === -1 ? 'unlimited' : chatLimit,
          remaining: chatLimit === -1 ? 'unlimited' : Math.max(0, chatLimit - activeChatCount),
        },
      },
    });
  });

  // Forgot Password - Request reset token
  forgotPassword = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { email } = req.body;

    const { token, user } = await userService.generatePasswordResetToken(email);

    // In production, send this token via email
    // For now, we'll return it in the response (NOT RECOMMENDED FOR PRODUCTION)
    // TODO: Integrate email service (SendGrid, AWS SES, etc.)
    
    logger.info(`Password reset requested for user: ${user.id}`);

    sendSuccessResponse(res, 200, 'Password reset token generated. Check your email.', {
      message: 'If an account exists with this email, a password reset link has been sent.',
      // Remove this in production - only for development/testing
      ...(process.env.NODE_ENV === 'development' && { resetToken: token }),
    });
  });

  // Reset Password - Verify token and set new password
  resetPassword = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { token, newPassword } = req.body;

    await userService.resetPassword(token, newPassword);

    sendSuccessResponse(res, 200, 'Password reset successful. You can now login with your new password.', null);
  });
}

export const authController = new AuthController();
