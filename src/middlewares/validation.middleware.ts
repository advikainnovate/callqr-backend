import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BadRequestError } from '../utils';

export const validateRequest = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.body || Object.keys(req.body).length === 0) {
        // Some routes might allow empty body, but Zod schema will catch it if required.
        // But if it's strictly undefined/null, we might want to warn.
      }

      // Validate request body
      const validatedData = schema.parse(req.body);

      // Replace request body with validated data
      req.body = validatedData;

      next();
    } catch (error) {
      next(error);
    }
  };
};

export const validateParams = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request parameters
      const validatedData = schema.parse(req.params);

      // Replace request params with validated data
      (req.params as any) = validatedData;

      next();
    } catch (error) {
      next(error);
    }
  };
};

export const validateQuery = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate query parameters
      const validatedData = schema.parse(req.query);

      // Replace request query with validated data
      req.query = validatedData as any;

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Combined validation middleware
 */
export const validate = (schemas: {
  body?: z.ZodSchema;
  params?: z.ZodSchema;
  query?: z.ZodSchema;
}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.params) {
        (req.params as any) = schemas.params.parse(req.params);
      }
      if (schemas.query) {
        (req.query as any) = schemas.query.parse(req.query);
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Common validation schemas
export const uuidSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

export const qrCodeIdSchema = z.object({
  qrCodeId: z.string().uuid('Invalid QR code ID format'),
});

export const tokenSchema = z.object({
  token: z.string().min(1, 'Token is required').max(255, 'Token too long'),
});
