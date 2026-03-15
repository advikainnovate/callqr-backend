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
}

export const authenticateToken = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      throw new UnauthorizedError('Access token required');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, appConfig.jwt.secret) as any;
    } catch (error: any) {
      logger.warn('Invalid token attempt:', error.message);
      throw new ForbiddenError('Invalid or expired token');
    }

    req.user = decoded as { userId: string; username: string };

    // Check if user is globally blocked
    try {
      const { userService } = await import('../services/user.service');
      const isBlocked = await userService.isGloballyBlocked(req.user.userId);

      if (isBlocked) {
        logger.warn(
          `Globally blocked user attempted access: ${req.user.userId}`
        );
        throw new ForbiddenError(
          'Your account has been globally blocked. Please contact support.'
        );
      }
    } catch (error) {
      if (error instanceof ForbiddenError) {
        throw error;
      }
      logger.error('Error checking global block status:', error);
      // Continue if check fails - don't block legitimate users due to check failure
    }

    next();
  }
);
