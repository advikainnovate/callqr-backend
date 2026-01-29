/**
 * Password Hashing Utility
 * 
 * Implements secure password hashing using bcrypt with proper salt generation.
 */

import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

/**
 * Password hash configuration
 */
export interface PasswordHashConfig {
  readonly saltRounds: number;
  readonly pepper?: string; // Optional additional secret
}

/**
 * Default configuration for password hashing
 */
export const DEFAULT_HASH_CONFIG: PasswordHashConfig = {
  saltRounds: 12 // Recommended for 2024+ security standards
};

/**
 * Password hash result
 */
export interface PasswordHashResult {
  readonly hash: string;
  readonly salt: string;
  readonly algorithm: string;
  readonly rounds: number;
}

/**
 * Hashes a password using bcrypt with additional security measures
 */
export async function hashPassword(
  password: string,
  config: PasswordHashConfig = DEFAULT_HASH_CONFIG
): Promise<PasswordHashResult> {
  if (!password || password.length === 0) {
    throw new Error('Password cannot be empty');
  }

  // Generate additional salt for extra security
  const additionalSalt = crypto.randomBytes(32).toString('hex');
  
  // Apply pepper if configured
  const pepperedPassword = config.pepper 
    ? password + config.pepper + additionalSalt
    : password + additionalSalt;

  // Hash the password using bcrypt
  const hash = await bcrypt.hash(pepperedPassword, config.saltRounds);

  return {
    hash,
    salt: additionalSalt,
    algorithm: 'bcrypt',
    rounds: config.saltRounds
  };
}

/**
 * Verifies a password against its hash
 */
export async function verifyPassword(
  password: string,
  hashResult: PasswordHashResult,
  config: PasswordHashConfig = DEFAULT_HASH_CONFIG
): Promise<boolean> {
  if (!password || !hashResult.hash) {
    return false;
  }

  try {
    // Reconstruct the peppered password
    const pepperedPassword = config.pepper 
      ? password + config.pepper + hashResult.salt
      : password + hashResult.salt;

    // Verify using bcrypt
    return await bcrypt.compare(pepperedPassword, hashResult.hash);
  } catch (error) {
    // Log error but don't expose details
    console.error('Password verification error:', error);
    return false;
  }
}

/**
 * Checks if a password hash needs to be updated (due to changed security parameters)
 */
export function needsRehash(
  hashResult: PasswordHashResult,
  config: PasswordHashConfig = DEFAULT_HASH_CONFIG
): boolean {
  // Check if rounds have been increased
  if (hashResult.rounds < config.saltRounds) {
    return true;
  }

  // Check if algorithm is outdated (future-proofing)
  if (hashResult.algorithm !== 'bcrypt') {
    return true;
  }

  return false;
}

/**
 * Generates a secure random salt
 */
export function generateSalt(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Securely compares two strings to prevent timing attacks
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}