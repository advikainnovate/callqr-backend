import jwt, { SignOptions } from 'jsonwebtoken';
import { UnauthorizedError } from './ApiError';
import { error as errorMessages } from '../constants/messages';
import { appConfig } from '../config';

export type TokenPayload =
  | { type: 'user'; userId: string; username: string }
  | { type: 'guest'; guestId: string };

/**
 * Generates an access token.
 * @param payload The data to include in the token.
 * @returns The generated access token string.
 */
export const generateAccessToken = (payload: TokenPayload): string => {
  const options: SignOptions = {
    expiresIn: appConfig.jwt.accessTokenExpiresIn as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, appConfig.jwt.secret, options);
};

/**
 * Generates a guest token with a 7-day expiration.
 * @param guestId The guest ID to include in the token.
 * @returns The generated guest token string.
 */
export const generateGuestToken = (guestId: string): string => {
  const payload: TokenPayload = { type: 'guest', guestId };
  const options: SignOptions = {
    expiresIn: '7d',
  };
  return jwt.sign(payload, appConfig.jwt.secret, options);
};

/**
 * Generates a refresh token.
 * @param payload The data to include in the token.
 * @returns The refresh token string.
 */
export const generateRefreshToken = (payload: TokenPayload): string => {
  const options: SignOptions = {
    expiresIn: appConfig.jwt.refreshTokenExpiresIn as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, appConfig.jwt.secret, options);
};

/**
 * Verifies a JWT token.
 * @param token The JWT token string to verify.
 * @returns The decoded payload if the token is valid.
 * @throws {UnauthorizedError} if the token is invalid or expired.
 */
export const verifyToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, appConfig.jwt.secret) as TokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError(errorMessages.AUTH.EXPIRED_TOKEN);
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError(errorMessages.AUTH.INVALID_TOKEN);
    }
    throw new UnauthorizedError(errorMessages.AUTH.INVALID_TOKEN);
  }
};

/**
 * Decodes a JWT token without verifying its signature.
 * @param token The JWT token string to decode.
 * @returns The decoded payload or null if decoding fails.
 */
export const decodeToken = (token: string): TokenPayload | null => {
  return jwt.decode(token) as TokenPayload | null;
};
