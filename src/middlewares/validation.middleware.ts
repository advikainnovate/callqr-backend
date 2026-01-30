import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../utils';

export const validateRequest = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      const validatedData = schema.parse(req.body);
      
      // Replace request body with validated data
      req.body = validatedData;
      
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Validation error:', error.issues);
        
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        });
      }
      
      logger.error('Unexpected validation error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error during validation',
      });
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
      if (error instanceof z.ZodError) {
        logger.warn('Parameter validation error:', error.issues);
        
        return res.status(400).json({
          success: false,
          message: 'Invalid parameters',
          errors: error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        });
      }
      
      logger.error('Unexpected parameter validation error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error during parameter validation',
      });
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
