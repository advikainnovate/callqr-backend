import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { appConfig } from '../config';
import {
  logger,
  UnauthorizedError,
  ForbiddenError,
  asyncHandler,
} from '../utils';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    username: string;
  };
  guestId?: string;
  guestIp?: string;
}

export const authenticateToken = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      throw new UnauthorizedError('Access token required');
    }

    const decoded = jwt.verify(token, appConfig.jwt.secret) as any;
    req.user = decoded as { userId: string; username: string };

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
    const guestId = req.headers['x-guest-id'] as string;

    if (!token && !guestId) {
      throw new UnauthorizedError('Access token or guest ID required');
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, appConfig.jwt.secret) as any;
        req.user = decoded as { userId: string; username: string };

        const { userService } = await import('../services/user.service');
        if (await userService.isGloballyBlocked(req.user.userId)) {
          throw new ForbiddenError('Account is globally blocked.');
        }
      } catch (err) {
        if (!guestId) throw new ForbiddenError('Invalid token');
        // If token fails but guestId is present, we treat it as guest
      }
    }

    if (!req.user && guestId) {
      req.guestId = guestId;
      req.guestIp = req.ip;
    }

    next();
  }
);
