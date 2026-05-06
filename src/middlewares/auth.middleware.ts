import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { appConfig } from '../config';
import {
  logger,
  UnauthorizedError,
  ForbiddenError,
  asyncHandler,
} from '../utils';

export type Identity =
  | { type: 'user'; userId: string; username: string }
  | { type: 'guest'; guestId: string; guestIp?: string };

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    username: string;
  };
  guestId?: string;
  guestIp?: string;
  identity?: Identity;
}

const VERIFICATION_EXEMPT_ROUTES = new Set([
  'POST /api/auth/send-phone-verification',
  'POST /api/auth/verify-phone',
  'POST /api/auth/resend-phone-verification',
  'GET /api/auth/phone-verification-status',
]);

const isVerificationExemptRoute = (req: Request): boolean => {
  return VERIFICATION_EXEMPT_ROUTES.has(
    `${req.method.toUpperCase()} ${req.baseUrl}${req.path}`
  );
};

export const authenticateToken = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return next(new UnauthorizedError('Access token required'));
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, appConfig.jwt.secret);
    } catch (err) {
      return next(new UnauthorizedError('Invalid or expired token'));
    }

    if (decoded.type !== 'user' || !decoded.userId) {
      return next(new ForbiddenError('User authentication required'));
    }

    req.user = {
      userId: decoded.userId,
      username: decoded.username,
    };

    req.identity = {
      type: 'user',
      userId: decoded.userId,
      username: decoded.username,
    };

    // Check if user is globally blocked
    const { userService } = await import('../services/user.service');
    const user = await userService.getUserById(req.user.userId);
    const isBlocked = user.isGloballyBlocked === 'true';

    if (isBlocked) {
      return next(
        new ForbiddenError(
          'Your account has been globally blocked. Please contact support.'
        )
      );
    }

    const adminUserIds = (process.env.ADMIN_USER_IDS || '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);
    const isAdmin = adminUserIds.includes(req.user.userId);

    if (
      !isAdmin &&
      (user.status === 'pending_verification' ||
        user.isPhoneVerified !== 'true') &&
      !isVerificationExemptRoute(req)
    ) {
      return next(
        new ForbiddenError(
          'Phone verification is required before accessing this resource.'
        )
      );
    }

    next();
  }
);

/** Middleware that allows either a valid JWT Or a guestId header. */
export const authenticateTokenOrGuest = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    const guestIdHeader = req.headers['x-guest-id'] as string;

    if (token) {
      let decoded: any;
      try {
        decoded = jwt.verify(token, appConfig.jwt.secret);
      } catch (err) {
        return next(new UnauthorizedError('Invalid or expired token'));
      }

      if (decoded.type === 'user' && decoded.userId) {
        req.user = {
          userId: decoded.userId,
          username: decoded.username,
        };
        req.identity = {
          type: 'user',
          userId: decoded.userId,
          username: decoded.username,
        };

        const { userService } = await import('../services/user.service');
        if (await userService.isGloballyBlocked(req.user.userId)) {
          return next(new ForbiddenError('Account is globally blocked.'));
        }
      } else if (decoded.type === 'guest' && decoded.guestId) {
        req.guestId = decoded.guestId;
        req.guestIp = req.ip;
        req.identity = {
          type: 'guest',
          guestId: decoded.guestId,
          guestIp: req.ip,
        };
      } else {
        return next(new ForbiddenError('Invalid token payload'));
      }

      return next();
    }

    // Fallback to x-guest-id header (temporary)
    if (guestIdHeader) {
      logger.warn('Using deprecated x-guest-id header');
      req.guestId = guestIdHeader;
      req.guestIp = req.ip;
      req.identity = {
        type: 'guest',
        guestId: guestIdHeader,
        guestIp: req.ip,
      };
      return next();
    }

    return next(new UnauthorizedError('Authentication required'));
  }
);
