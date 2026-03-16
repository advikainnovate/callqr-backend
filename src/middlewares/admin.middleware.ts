import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { ForbiddenError } from '../utils/ApiError';

// Admin user IDs - in production, this should be in database or environment variable
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || '')
  .split(',')
  .filter(Boolean);

export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const userId = req.user?.userId;

  if (!userId) {
    return next(new ForbiddenError('Authentication required'));
  }

  // Check if user is admin
  if (!ADMIN_USER_IDS.includes(userId)) {
    return next(new ForbiddenError('Admin access required'));
  }

  next();
};
