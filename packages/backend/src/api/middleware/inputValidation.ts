/**
 * Input Validation Middleware
 * 
 * Comprehensive input validation and sanitization for all API endpoints.
 * Implements security checks and data validation to prevent malicious input.
 * 
 * Requirements: 10.3
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Validation rule interface
 */
export interface ValidationRule {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'email' | 'uuid' | 'array' | 'object';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: string[];
  length?: number;
  custom?: (value: any) => boolean | string;
}

/**
 * Validation schema interface
 */
export interface ValidationSchema {
  [key: string]: ValidationRule;
}

/**
 * Validation error interface
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

/**
 * Input validation middleware factory
 */
export function inputValidationMiddleware(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validateInput(req.body, schema);
      
      if (errors.length > 0) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors,
          timestamp: new Date().toISOString()
        });
      }

      // Sanitize input
      req.body = sanitizeInput(req.body, schema);
      
      next();
    } catch (error) {
      console.error('Input validation error:', error);
      return res.status(500).json({
        error: 'Input validation failed',
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Query parameter validation middleware factory
 */
export function queryValidationMiddleware(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validateInput(req.query, schema);
      
      if (errors.length > 0) {
        return res.status(400).json({
          error: 'Query validation failed',
          details: errors,
          timestamp: new Date().toISOString()
        });
      }

      // Sanitize query parameters
      req.query = sanitizeInput(req.query, schema);
      
      next();
    } catch (error) {
      console.error('Query validation error:', error);
      return res.status(500).json({
        error: 'Query validation failed',
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Validate input against schema
 */
export function validateInput(input: any, schema: ValidationSchema): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check for required fields
  for (const [field, rule] of Object.entries(schema)) {
    if (rule.required && (input[field] === undefined || input[field] === null)) {
      errors.push({
        field,
        message: `${field} is required`
      });
      continue;
    }

    // Skip validation if field is not present and not required
    if (input[field] === undefined || input[field] === null) {
      continue;
    }

    const value = input[field];
    const fieldErrors = validateField(field, value, rule);
    errors.push(...fieldErrors);
  }

  return errors;
}

/**
 * Validate individual field
 */
function validateField(field: string, value: any, rule: ValidationRule): ValidationError[] {
  const errors: ValidationError[] = [];

  // Type validation
  if (rule.type) {
    const typeError = validateType(field, value, rule.type);
    if (typeError) {
      errors.push(typeError);
      return errors; // Stop further validation if type is wrong
    }
  }

  // String validations
  if (typeof value === 'string') {
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      errors.push({
        field,
        message: `${field} must be at least ${rule.minLength} characters long`,
        value: value.length
      });
    }

    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      errors.push({
        field,
        message: `${field} must be at most ${rule.maxLength} characters long`,
        value: value.length
      });
    }

    if (rule.length !== undefined && value.length !== rule.length) {
      errors.push({
        field,
        message: `${field} must be exactly ${rule.length} characters long`,
        value: value.length
      });
    }

    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push({
        field,
        message: `${field} format is invalid`,
        value
      });
    }

    if (rule.enum && !rule.enum.includes(value)) {
      errors.push({
        field,
        message: `${field} must be one of: ${rule.enum.join(', ')}`,
        value
      });
    }
  }

  // Number validations
  if (typeof value === 'number') {
    if (rule.min !== undefined && value < rule.min) {
      errors.push({
        field,
        message: `${field} must be at least ${rule.min}`,
        value
      });
    }

    if (rule.max !== undefined && value > rule.max) {
      errors.push({
        field,
        message: `${field} must be at most ${rule.max}`,
        value
      });
    }
  }

  // Custom validation
  if (rule.custom) {
    const customResult = rule.custom(value);
    if (customResult !== true) {
      errors.push({
        field,
        message: typeof customResult === 'string' ? customResult : `${field} is invalid`,
        value
      });
    }
  }

  return errors;
}

/**
 * Validate field type
 */
function validateType(field: string, value: any, expectedType: string): ValidationError | null {
  switch (expectedType) {
    case 'string':
      if (typeof value !== 'string') {
        return { field, message: `${field} must be a string`, value: typeof value };
      }
      break;

    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        return { field, message: `${field} must be a number`, value: typeof value };
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        return { field, message: `${field} must be a boolean`, value: typeof value };
      }
      break;

    case 'email':
      if (typeof value !== 'string' || !isValidEmail(value)) {
        return { field, message: `${field} must be a valid email address`, value };
      }
      break;

    case 'uuid':
      if (typeof value !== 'string' || !isValidUUID(value)) {
        return { field, message: `${field} must be a valid UUID`, value };
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        return { field, message: `${field} must be an array`, value: typeof value };
      }
      break;

    case 'object':
      if (typeof value !== 'object' || Array.isArray(value) || value === null) {
        return { field, message: `${field} must be an object`, value: typeof value };
      }
      break;

    default:
      console.warn(`Unknown validation type: ${expectedType}`);
  }

  return null;
}

/**
 * Sanitize input data
 */
export function sanitizeInput(input: any, schema: ValidationSchema): any {
  if (typeof input !== 'object' || input === null) {
    return input;
  }

  const sanitized: any = {};

  for (const [field, rule] of Object.entries(schema)) {
    if (input[field] !== undefined && input[field] !== null) {
      sanitized[field] = sanitizeField(input[field], rule);
    }
  }

  return sanitized;
}

/**
 * Sanitize individual field
 */
function sanitizeField(value: any, rule: ValidationRule): any {
  if (typeof value === 'string') {
    // Trim whitespace
    value = value.trim();

    // Remove potentially dangerous characters for security
    value = value.replace(/[<>]/g, '');

    // Additional sanitization based on type
    if (rule.type === 'email') {
      value = value.toLowerCase();
    }
  }

  return value;
}

/**
 * Email validation helper
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * UUID validation helper
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Security-focused input sanitization middleware
 */
export function securitySanitizationMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Sanitize request body
      if (req.body && typeof req.body === 'object') {
        req.body = deepSanitize(req.body);
      }

      // Sanitize query parameters
      if (req.query && typeof req.query === 'object') {
        req.query = deepSanitize(req.query);
      }

      // Sanitize URL parameters
      if (req.params && typeof req.params === 'object') {
        req.params = deepSanitize(req.params);
      }

      next();
    } catch (error) {
      console.error('Security sanitization error:', error);
      return res.status(500).json({
        error: 'Request processing failed',
        timestamp: new Date().toISOString()
      });
    }
  };
}

/**
 * Deep sanitization of nested objects
 */
function deepSanitize(obj: any): any {
  if (typeof obj === 'string') {
    return obj
      .trim()
      .replace(/[<>]/g, '') // Remove potential XSS characters
      .replace(/[\x00-\x1f\x7f]/g, ''); // Remove control characters
  }

  if (Array.isArray(obj)) {
    return obj.map(deepSanitize);
  }

  if (typeof obj === 'object' && obj !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize key names too
      const sanitizedKey = key.replace(/[<>]/g, '').trim();
      sanitized[sanitizedKey] = deepSanitize(value);
    }
    return sanitized;
  }

  return obj;
}

/**
 * Content-Type validation middleware
 */
export function contentTypeValidationMiddleware(allowedTypes: string[] = ['application/json']) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentType = req.get('Content-Type');
    
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      if (!contentType || !allowedTypes.some(type => contentType.includes(type))) {
        return res.status(415).json({
          error: 'Unsupported Media Type',
          allowedTypes,
          timestamp: new Date().toISOString()
        });
      }
    }

    next();
  };
}

/**
 * Request size validation middleware
 */
export function requestSizeValidationMiddleware(maxSizeBytes: number = 1024 * 1024) { // 1MB default
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.get('Content-Length');
    
    if (contentLength && parseInt(contentLength) > maxSizeBytes) {
      return res.status(413).json({
        error: 'Request entity too large',
        maxSize: maxSizeBytes,
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
}