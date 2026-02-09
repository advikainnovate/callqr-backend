import { Request, Response, NextFunction } from 'express';
import { z } from 'zod'; // Import z for ZodError check
import { logger } from '../utils';
import ApiError, { NotFoundError, BadRequestError } from '../utils/ApiError';
import { error as errorMessages } from '../constants/messages';
import { sendErrorResponse } from '../utils/responseHandler';
import { appConfig } from '../config';

// 404 handler - using a specific error class
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  next(new NotFoundError(`Route not found: ${req.originalUrl}`));
};

// Main error handling middleware
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let error = err;

  // Log error details for every occurrence
  const errorLogMeta = {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userId: (req as any).user?.userId,
    timestamp: new Date().toISOString(),
  };

  // Handle Zod validation errors
  if (err instanceof z.ZodError) {
    const message = 'Validation error';
    const details = err.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    logger.warn(`VALIDATION_ERROR: ${req.method} ${req.path}`, {
      ...errorLogMeta,
      errors: details,
    });

    sendErrorResponse(res, 400, message, undefined, details);
    return;
  }

  // If the error is not an instance of ApiError, it's an unexpected server error.
  if (!(error instanceof ApiError)) {
    logger.error(`UNHANDLED_ERROR: ${err.message}`, {
      ...errorLogMeta,
      stack: err.stack,
    });

    error = new ApiError(
      errorMessages.INTERNAL_SERVER_ERROR,
      500,
      false
    );
  } else {
    // Log specialized API errors
    const apiErr = error as ApiError;
    let logLevel: 'error' | 'warn' | 'info' = 'warn';

    if (apiErr.statusCode >= 500) {
      logLevel = 'error';
    } else if (apiErr.statusCode === 401 || apiErr.statusCode === 403) {
      logLevel = 'info';
    }

    logger[logLevel](`API_ERROR (${apiErr.statusCode}): ${apiErr.message}`, {
      ...errorLogMeta,
      isOperational: apiErr.isOperational,
    });
  }

  const { statusCode, message, isOperational, stack } = error as ApiError;

  // For non-operational errors in production, we don't leak details.
  if (!isOperational && appConfig.env === 'production') {
    sendErrorResponse(res, 500, errorMessages.INTERNAL_SERVER_ERROR);
    return;
  }

  // Include stack trace in development
  const errorStack = appConfig.env === 'development' ? stack : undefined;

  sendErrorResponse(res, statusCode, message, undefined, undefined, errorStack);
};
