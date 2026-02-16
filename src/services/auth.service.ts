import crypto from 'crypto';
import { eq, and, gt } from 'drizzle-orm';
import { db } from '../db';
import { 
  emailVerifications, 
  passwordResets, 
  type NewEmailVerification, 
  type NewPasswordReset 
} from '../models';
import { userService } from './user.service';
import { emailService } from './email.service';
import { logger, NotFoundError, BadRequestError, UnauthorizedError } from '../utils';
import { v4 as uuidv4 } from 'uuid';

export class AuthService {
  /**
   * Generate a secure random token
   */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Request email verification
   */
  async requestEmailVerification(userId: string, email: string): Promise<void> {
    const user = await userService.getUserById(userId);
    
    if (user.emailVerified === 'yes') {
      throw new BadRequestError('Email is already verified');
    }

    // Generate verification token
    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours expiry

    // Store verification token
    await db.insert(emailVerifications).values({
      id: uuidv4(),
      userId,
      email,
      token,
      expiresAt,
    });

    // Send verification email
    await emailService.sendVerificationEmail(email, token);
    
    logger.info(`Email verification requested for user: ${userId}`);
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<void> {
    const [verification] = await db
      .select()
      .from(emailVerifications)
      .where(
        and(
          eq(emailVerifications.token, token),
          gt(emailVerifications.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!verification) {
      throw new BadRequestError('Invalid or expired verification token');
    }

    if (verification.verifiedAt) {
      throw new BadRequestError('Email already verified');
    }

    // Mark as verified
    await db
      .update(emailVerifications)
      .set({ verifiedAt: new Date() })
      .where(eq(emailVerifications.id, verification.id));

    // Update user email verification status
    const { users } = await import('../models');
    await db
      .update(users)
      .set({ 
        emailVerified: 'yes',
        updatedAt: new Date(),
      })
      .where(eq(users.id, verification.userId));

    logger.info(`Email verified for user: ${verification.userId}`);
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(username: string, email: string): Promise<void> {
    const user = await userService.getUserByUsername(username);
    
    if (!user) {
      // Don't reveal if user exists
      logger.warn(`Password reset requested for non-existent user: ${username}`);
      return;
    }

    // Verify email matches (compare hashes)
    const emailHash = crypto.createHash('sha256').update(email).digest('hex');
    if (user.emailHash !== emailHash) {
      logger.warn(`Password reset email mismatch for user: ${user.id}`);
      return; // Don't reveal mismatch
    }

    // Generate reset token
    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry

    // Store reset token
    await db.insert(passwordResets).values({
      id: uuidv4(),
      userId: user.id,
      token,
      expiresAt,
    });

    // Send reset email
    await emailService.sendPasswordResetEmail(email, token);
    
    logger.info(`Password reset requested for user: ${user.id}`);
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const [reset] = await db
      .select()
      .from(passwordResets)
      .where(
        and(
          eq(passwordResets.token, token),
          gt(passwordResets.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!reset) {
      throw new BadRequestError('Invalid or expired reset token');
    }

    if (reset.usedAt) {
      throw new BadRequestError('Reset token already used');
    }

    // Validate new password
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestError('Password must be at least 6 characters long');
    }

    // Update password using user service
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash(newPassword, 10);

    const { users } = await import('../models');
    await db
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, reset.userId));

    // Mark token as used
    await db
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(eq(passwordResets.id, reset.id));

    logger.info(`Password reset completed for user: ${reset.userId}`);
  }
}

export const authService = new AuthService();
