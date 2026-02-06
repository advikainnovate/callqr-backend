import rateLimit from 'express-rate-limit';
import { logger } from '../utils';
import { Request } from 'express';

// General API rate limiter
export const apiLimiter = (req: Request, res: any, next: any) => next();
// export const apiLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // Limit each IP to 100 requests per windowMs
//   message: {
//     success: false,
//     message: 'Too many requests from this IP, please try again later.',
//   },
//   standardHeaders: true,
//   legacyHeaders: false,
//   handler: (req, res) => {
//     logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
//     res.status(429).json({
//       success: false,
//       message: 'Too many requests from this IP, please try again later.',
//     });
//   },
// });

// Strict rate limiter for QR code scanning
export const qrScanLimiter = (req: Request, res: any, next: any) => next();
// export const qrScanLimiter = rateLimit({
//   windowMs: 1 * 60 * 1000, // 1 minute
//   max: 10, // Limit each IP to 10 QR scans per minute
//   message: {
//     success: false,
//     message: 'Too many QR scan attempts, please try again later.',
//   },
//   handler: (req, res) => {
//     logger.warn(`QR scan rate limit exceeded for IP: ${req.ip}`);
//     res.status(429).json({
//       success: false,
//       message: 'Too many QR scan attempts, please try again later.',
//     });
//   },
// });

// Rate limiter for QR code creation
export const qrCreateLimiter = (req: Request, res: any, next: any) => next();
// export const qrCreateLimiter = rateLimit({
//   windowMs: 60 * 60 * 1000, // 1 hour
//   max: 5, // Limit each user to 5 QR codes per hour
//   message: {
//     success: false,
//     message: 'Too many QR codes created, please try again later.',
//   },
//   handler: (req, res) => {
//     logger.warn(`QR creation rate limit exceeded for: ${(req as any).user?.userId || req.ip}`);
//     res.status(429).json({
//       success: false,
//       message: 'Too many QR codes created, please try again later.',
//     });
//   },
// });

// Rate limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 auth attempts per 15 minutes
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    logger.warn(`Auth rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts, please try again later.',
    });
  },
});
