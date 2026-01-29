/**
 * Password Validation Utility
 * 
 * Implements secure password validation according to security requirements.
 */

import { PasswordRequirements } from './types';

/**
 * Default password requirements
 */
export const DEFAULT_PASSWORD_REQUIREMENTS: PasswordRequirements = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true
};

/**
 * Password validation result
 */
export interface PasswordValidationResult {
  readonly isValid: boolean;
  readonly errors: string[];
  readonly strength: PasswordStrength;
}

/**
 * Password strength levels
 */
export enum PasswordStrength {
  WEAK = 'weak',
  MEDIUM = 'medium',
  STRONG = 'strong',
  VERY_STRONG = 'very_strong'
}

/**
 * Validates password against security requirements
 */
export function validatePassword(
  password: string,
  requirements: PasswordRequirements = DEFAULT_PASSWORD_REQUIREMENTS
): PasswordValidationResult {
  const errors: string[] = [];

  // Check minimum length
  if (password.length < requirements.minLength) {
    errors.push(`Password must be at least ${requirements.minLength} characters long`);
  }

  // Check uppercase requirement
  if (requirements.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  // Check lowercase requirement
  if (requirements.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  // Check numbers requirement
  if (requirements.requireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  // Check special characters requirement
  if (requirements.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Check for common weak patterns
  if (isCommonPassword(password)) {
    errors.push('Password is too common and easily guessable');
  }

  // Check for sequential characters
  if (hasSequentialCharacters(password)) {
    errors.push('Password should not contain sequential characters');
  }

  // Check for repeated characters
  if (hasRepeatedCharacters(password)) {
    errors.push('Password should not contain excessive repeated characters');
  }

  const strength = calculatePasswordStrength(password);
  const isValid = errors.length === 0 && strength !== PasswordStrength.WEAK;

  return {
    isValid,
    errors,
    strength
  };
}

/**
 * Calculates password strength based on various factors
 */
function calculatePasswordStrength(password: string): PasswordStrength {
  let score = 0;

  // Length scoring
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;

  // Character variety scoring
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 1;

  // Complexity scoring
  if (password.length > 12 && /[a-zA-Z]/.test(password) && /\d/.test(password)) score += 1;
  if (!hasRepeatedCharacters(password)) score += 1;
  if (!hasSequentialCharacters(password)) score += 1;

  // Return strength based on score
  if (score <= 3) return PasswordStrength.WEAK;
  if (score <= 5) return PasswordStrength.MEDIUM;
  if (score <= 7) return PasswordStrength.STRONG;
  return PasswordStrength.VERY_STRONG;
}

/**
 * Checks if password is in common password list
 */
function isCommonPassword(password: string): boolean {
  const commonPasswords = [
    'password', '123456', '123456789', 'qwerty', 'abc123',
    'password123', 'admin', 'letmein', 'welcome', 'monkey',
    'dragon', 'master', 'shadow', 'superman', 'michael',
    'football', 'baseball', 'liverpool', 'jordan', 'princess'
  ];

  return commonPasswords.includes(password.toLowerCase());
}

/**
 * Checks for sequential characters (abc, 123, etc.)
 */
function hasSequentialCharacters(password: string): boolean {
  const sequences = [
    'abcdefghijklmnopqrstuvwxyz',
    'qwertyuiopasdfghjklzxcvbnm',
    '0123456789'
  ];

  for (const sequence of sequences) {
    for (let i = 0; i <= sequence.length - 3; i++) {
      const subseq = sequence.substring(i, i + 3);
      if (password.toLowerCase().includes(subseq)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks for excessive repeated characters
 */
function hasRepeatedCharacters(password: string): boolean {
  // Check for 3 or more consecutive identical characters
  return /(.)\1{2,}/.test(password);
}