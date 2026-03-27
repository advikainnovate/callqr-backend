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

export const authenticateToken = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      throw new UnauthorizedError('Access token required');
    }

    const decoded = jwt.verify(token, appConfig.jwt.secret) as any;

    if (decoded.type !== 'user' || !decoded.userId) {
      throw new ForbiddenError('User authentication required');
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
    const isBlocked = await userService.isGloballyBlocked(req.user.userId);

    if (isBlocked) {
      throw new ForbiddenError(
        'Your account has been globally blocked. Please contact support.'
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
      const decoded = jwt.verify(token, appConfig.jwt.secret) as any;

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
          throw new ForbiddenError('Account is globally blocked.');
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
        throw new ForbiddenError('Invalid token payload');
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

    throw new UnauthorizedError('Authentication required');
  }
);
