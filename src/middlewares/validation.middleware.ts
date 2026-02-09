import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BadRequestError } from '../utils';

export const validateRequest = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.body === undefined) {
      throw new BadRequestError('Request body is required (or could not be parsed). Ensure you send JSON with Content-Type: application/json.');
    }

    // Validate request body
    const validatedData = schema.parse(req.body);

    // Replace request body with validated data
    req.body = validatedData;

    next();
  };
};

export const validateParams = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Validate request parameters
    const validatedData = schema.parse(req.params);

    // Replace request params with validated data
    (req.params as any) = validatedData;

    next();
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
