import rateLimit from 'express-rate-limit';
import { logger, TooManyRequestsError } from '../utils';
import { Request, Response, NextFunction } from 'express';

// General API rate limiter
export const apiLimiter = (req: Request, res: any, next: any) => next();
// ... (rest of the commented code)

// ...

// Rate limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  limit: 2000, // Limit each IP to 2000 auth attempts per minute
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
  skipSuccessfulRequests: true,
  handler: (req, res, next) => {
    logger.warn(`Auth rate limit exceeded for IP: ${req.ip}`);
    next(new TooManyRequestsError('Too many authentication attempts, please try again later.'));
  },
});
