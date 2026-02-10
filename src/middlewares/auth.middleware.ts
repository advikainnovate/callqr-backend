import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { appConfig } from '../config';
import { logger, UnauthorizedError, ForbiddenError } from '../utils';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    username: string;
  };
}

export const authenticateToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    throw new UnauthorizedError('Access token required');
  }

  jwt.verify(token, appConfig.jwt.secret, (err, decoded) => {
    if (err) {
      logger.warn('Invalid token attempt:', err.message);
      return next(new ForbiddenError('Invalid or expired token'));
    }

    req.user = decoded as { userId: string; username: string };
    next();
  });
};
