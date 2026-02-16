import { eq, or } from 'drizzle-orm';
import { db } from '../db';
import { users, deletedUsers, type NewUser, type User, type NewDeletedUser } from '../models';
import { v4 as uuidv4 } from 'uuid';
import { logger, ConflictError, NotFoundError, BadRequestError, UnauthorizedError } from '../utils';
import { validateStatusTransition, USER_STATUS_TRANSITIONS } from '../utils/statusTransitions';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

export class UserService {
  private hashData(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Validate password hash format (bcrypt)
   * Bcrypt hashes start with $2a$, $2b$, or $2y$ and are 60 characters long
   */
  private isValidPasswordHash(hash: string): boolean {
    const bcryptRegex = /^\$2[aby]\$\d{2}\$.{53}$/;
    return bcryptRegex.test(hash);
  }

  async createUser(userData: {
    username: string;
    password: string;
    phone?: string;
    email?: string;
  }): Promise<User> {
    // Check if username already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.username, userData.username))
      .limit(1);

    if (existingUser.length > 0) {
      throw new ConflictError('Username already exists');
    }

    // Validate password
    if (!userData.password || userData.password.length < 6) {
      throw new BadRequestError('Password must be at least 6 characters long');
    }

    // Hash password
    const passwordHash = await this.hashPassword(userData.password);

    // Hash phone and email if provided
    const phoneHash = userData.phone ? this.hashData(userData.phone) : null;
    const emailHash = userData.email ? this.hashData(userData.email) : null;

    // Create new user
    const [user] = await db
      .insert(users)
      .values({
        id: uuidv4(),
        username: userData.username,
        passwordHash,
        phoneHash,
        emailHash,
        status: 'active',
      })
      .returning();

    // Create default FREE subscription for new user
    const { subscriptions } = await import('../models');
    const { SUBSCRIPTION_PLANS } = await import('../constants/subscriptions');
    
    await db.insert(subscriptions).values({
      id: uuidv4(),
      userId: user.id,
      plan: SUBSCRIPTION_PLANS.FREE,
      status: 'active',
      startedAt: new Date(),
      expiresAt: null,
    });

    logger.info(`User created successfully with FREE subscription: ${user.id}`);
    return user;
  }

  async authenticateUser(username: string, password: string): Promise<User> {
    // Find user by username
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!user) {
      throw new UnauthorizedError('Invalid username or password');
    }

    // Check if user is active
    if (user.status !== 'active') {
      throw new UnauthorizedError('Account is not active');
    }

    // Validate password hash format
    if (!this.isValidPasswordHash(user.passwordHash)) {
      logger.error(`Invalid password hash format for user: ${user.id}`);
      throw new UnauthorizedError('Account authentication error. Please contact support.');
    }

    // Verify password
    const isPasswordValid = await this.verifyPassword(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid username or password');
    }

    logger.info(`User authenticated successfully: ${user.id}`);
    return user;
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    // Get user
    const user = await this.getUserById(userId);

    // Verify old password
    const isPasswordValid = await this.verifyPassword(oldPassword, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Validate new password
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestError('New password must be at least 6 characters long');
    }

    // Hash new password
    const newPasswordHash = await this.hashPassword(newPassword);

    // Update password
    await db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    logger.info(`Password changed for user: ${userId}`);
  }

  async getUserById(id: string): Promise<User> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    return user || null;
  }

  async updateUser(
    userId: string,
    updateData: {
      username?: string;
      phone?: string;
      email?: string;
      status?: 'active' | 'blocked' | 'deleted';
    }
  ): Promise<User> {
    const user = await this.getUserById(userId);

    // Validate status transition if status is being changed
    if (updateData.status && updateData.status !== user.status) {
      validateStatusTransition(user.status, updateData.status, USER_STATUS_TRANSITIONS, 'User');
    }

    // Check if username is being changed and if it's already taken
    if (updateData.username) {
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.username, updateData.username))
        .limit(1);

      if (existingUser.length > 0 && existingUser[0].id !== userId) {
        throw new ConflictError('Username already exists');
      }
    }

    // Prepare update data
    const updatePayload: Partial<NewUser> = {
      updatedAt: new Date(),
    };

    if (updateData.username) updatePayload.username = updateData.username;
    if (updateData.phone) updatePayload.phoneHash = this.hashData(updateData.phone);
    if (updateData.email) updatePayload.emailHash = this.hashData(updateData.email);
    if (updateData.status) updatePayload.status = updateData.status;

    const [updatedUser] = await db
      .update(users)
      .set(updatePayload)
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) {
      throw new NotFoundError('User not found');
    }

    logger.info(`User updated: ${userId}`);
    return updatedUser;
  }

  async blockUser(userId: string, reason?: string, blockedBy?: string): Promise<User> {
    const user = await this.getUserById(userId);
    validateStatusTransition(user.status, 'blocked', USER_STATUS_TRANSITIONS, 'User');

    const [blockedUser] = await db
      .update(users)
      .set({
        status: 'blocked',
        blockedReason: reason || null,
        blockedAt: new Date(),
        blockedBy: blockedBy || null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    logger.info(`User blocked: ${userId}`, { reason, blockedBy });
    return blockedUser;
  }

  async unblockUser(userId: string): Promise<User> {
    const user = await this.getUserById(userId);
    validateStatusTransition(user.status, 'active', USER_STATUS_TRANSITIONS, 'User');

    const [unblockedUser] = await db
      .update(users)
      .set({
        status: 'active',
        blockedReason: null,
        blockedAt: null,
        blockedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    logger.info(`User unblocked: ${userId}`);
    return unblockedUser;
  }

  async deleteUser(userId: string, deletedBy?: string, reason?: string, recoveryDays: number = 30): Promise<void> {
    const user = await this.getUserById(userId);
    validateStatusTransition(user.status, 'deleted', USER_STATUS_TRANSITIONS, 'User');

    // Calculate recovery expiration
    const recoveryExpiresAt = new Date();
    recoveryExpiresAt.setDate(recoveryExpiresAt.getDate() + recoveryDays);

    // Store deleted user data for recovery
    await db.insert(deletedUsers).values({
      id: uuidv4(),
      originalUserId: user.id,
      username: user.username,
      userData: user as any, // Store full user object
      deletedBy: deletedBy || null,
      reason: reason || null,
      canRecover: 'yes',
      recoveryExpiresAt,
    });

    // Soft delete the user
    await db
      .update(users)
      .set({
        status: 'deleted',
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    logger.info(`User soft deleted: ${userId}`, { deletedBy, reason, recoveryExpiresAt });
  }

  async recoverUser(userId: string): Promise<User> {
    // Find deleted user record
    const [deletedUser] = await db
      .select()
      .from(deletedUsers)
      .where(eq(deletedUsers.originalUserId, userId))
      .limit(1);

    if (!deletedUser) {
      throw new NotFoundError('Deleted user record not found');
    }

    if (deletedUser.canRecover !== 'yes') {
      throw new BadRequestError('User cannot be recovered');
    }

    if (deletedUser.recoveryExpiresAt && deletedUser.recoveryExpiresAt < new Date()) {
      throw new BadRequestError('Recovery period has expired');
    }

    // Restore user
    const [recoveredUser] = await db
      .update(users)
      .set({
        status: 'active',
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    // Remove from deleted users table
    await db
      .delete(deletedUsers)
      .where(eq(deletedUsers.originalUserId, userId));

    logger.info(`User recovered: ${userId}`);
    return recoveredUser;
  }

  async permanentlyDeleteUser(userId: string): Promise<void> {
    // This should be called after recovery period expires
    // Remove from deleted users table
    await db
      .delete(deletedUsers)
      .where(eq(deletedUsers.originalUserId, userId));

    // Actually delete the user record
    await db
      .delete(users)
      .where(eq(users.id, userId));

    logger.info(`User permanently deleted: ${userId}`);
  }

  async activateUser(userId: string): Promise<User> {
    return this.updateUser(userId, { status: 'active' });
  }

  async isUserActive(userId: string): Promise<boolean> {
    const user = await this.getUserById(userId);
    return user.status === 'active';
  }

  async verifyPhone(phone: string): Promise<User | null> {
    const phoneHash = this.hashData(phone);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.phoneHash, phoneHash))
      .limit(1);

    return user || null;
  }

  async verifyEmail(email: string): Promise<User | null> {
    const emailHash = this.hashData(email);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.emailHash, emailHash))
      .limit(1);

    return user || null;
  }
}

export const userService = new UserService();
