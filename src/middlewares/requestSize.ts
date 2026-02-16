import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../utils';
import { currentEnv } from '../config/environments';

/**
 * Middleware to enforce request body size limits
 * This works in conjunction with express.json() and express.urlencoded() limits
 */
export const enforceRequestSizeLimit = (maxSize?: number) => {
  const limit = maxSize || currentEnv.files.maxFileSize;

  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.headers['content-length'];

    if (contentLength && parseInt(contentLength) > limit) {
      throw new BadRequestError(
        `Request body too large. Maximum size is ${(limit / 1024 / 1024).toFixed(2)}MB`
      );
    }

    next();
  };
};

/**
 * Middleware to validate file upload size
 */
export const validateFileSize = (req: Request, res: Response, next: NextFunction) => {
  if (!req.file && !req.files) {
    return next();
  }

  const maxSize = currentEnv.files.maxFileSize;

  // Single file
  if (req.file) {
    if (req.file.size > maxSize) {
      throw new BadRequestError(
        `File too large. Maximum size is ${(maxSize / 1024 / 1024).toFixed(2)}MB`
      );
    }
  }

  // Multiple files
  if (req.files && Array.isArray(req.files)) {
    for (const file of req.files) {
      if (file.size > maxSize) {
        throw new BadRequestError(
          `File '${file.originalname}' too large. Maximum size is ${(maxSize / 1024 / 1024).toFixed(2)}MB`
        );
      }
    }
  }

  next();
};
