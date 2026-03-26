import { eq, or, and } from 'drizzle-orm';
import { db } from '../db';
import {
  users,
  userBlocks,
  type NewUser,
  type User,
  type NewUserBlock,
  blockedGuests,
  type NewBlockedGuest,
  guestIdentifiers,
  type GuestIdentifier,
} from '../models';
import { v4 as uuidv4 } from 'uuid';
import {
  logger,
  ConflictError,
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
} from '../utils';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { appConfig } from '../config';

export class UserService {
  private hashData(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private encryptData(data: string): string {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(appConfig.encryptionKey, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decryptData(encryptedData: string): string {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(appConfig.encryptionKey, 'hex');
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  private async verifyPassword(
    password: string,
    hash: string
  ): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async createUser(userData: {
    username: string;
    password: string;
    phone?: string;
    email?: string;
    status?: string;
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

    // Encrypt and hash phone and email if provided
    const phone = userData.phone ? this.encryptData(userData.phone) : null;
    const email = userData.email ? this.encryptData(userData.email) : null;
    const phoneHash = userData.phone ? this.hashData(userData.phone) : null;
    const emailHash = userData.email ? this.hashData(userData.email) : null;

    // Create new user
    const [user] = await db
      .insert(users)
      .values({
        id: uuidv4(),
        username: userData.username,
        passwordHash,
        phone,
        email,
        phoneHash,
        emailHash,
        status: userData.status || 'active',
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

    // Check if user is globally blocked
    if (user.isGloballyBlocked === 'true') {
      throw new ForbiddenError(
        'Your account has been globally blocked. Please contact support.'
      );
    }

    // Check if user is active
    if (user.status !== 'active') {
      throw new UnauthorizedError('Account is not active');
    }

    // Verify password
    const isPasswordValid = await this.verifyPassword(
      password,
      user.passwordHash
    );

    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid username or password');
    }

    logger.info(`User authenticated successfully: ${user.id}`);
    return user;
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<void> {
    // Get user
    const user = await this.getUserById(userId);

    // Verify old password
    const isPasswordValid = await this.verifyPassword(
      oldPassword,
      user.passwordHash
    );

    if (!isPasswordValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Validate new password
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestError(
        'New password must be at least 6 characters long'
      );
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
    if (updateData.phone) {
      updatePayload.phone = this.encryptData(updateData.phone);
      updatePayload.phoneHash = this.hashData(updateData.phone);
    }
    if (updateData.email) {
      updatePayload.email = this.encryptData(updateData.email);
      updatePayload.emailHash = this.hashData(updateData.email);
    }
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

  async blockUser(userId: string): Promise<User> {
    return this.updateUser(userId, { status: 'blocked' });
  }

  async deleteUser(userId: string): Promise<User> {
    return this.updateUser(userId, { status: 'deleted' });
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

  async getUserProfile(userId: string): Promise<{
    id: string;
    username: string;
    phone: string | null;
    email: string | null;
    status: string;
    createdAt: Date | null;
    updatedAt: Date | null;
  }> {
    const user = await this.getUserById(userId);

    return {
      id: user.id,
      username: user.username,
      phone: user.phone ? this.decryptData(user.phone) : null,
      email: user.email ? this.decryptData(user.email) : null,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  // Forgot Password - Generate reset token
  async generatePasswordResetToken(
    email: string
  ): Promise<{ token: string; user: User }> {
    // Find user by email hash
    const emailHash = this.hashData(email);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.emailHash, emailHash))
      .limit(1);

    if (!user) {
      throw new NotFoundError('No account found with this email address');
    }

    if (user.status !== 'active') {
      throw new BadRequestError('Account is not active');
    }

    // Check if user is globally blocked
    if (user.isGloballyBlocked === 'true') {
      throw new ForbiddenError('Account is globally blocked. Contact support.');
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = this.hashData(resetToken);

    // Token expires in 1 hour
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // Save hashed token to database
    await db
      .update(users)
      .set({
        resetPasswordToken: hashedToken,
        resetPasswordExpires: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    logger.info(`Password reset token generated for user: ${user.id}`);

    return { token: resetToken, user };
  }

  // Reset Password - Verify token and update password
  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Hash the token to compare with database
    const hashedToken = this.hashData(token);

    // Find user with valid reset token
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.resetPasswordToken, hashedToken))
      .limit(1);

    if (!user) {
      throw new BadRequestError('Invalid or expired reset token');
    }

    // Check if token has expired
    if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      throw new BadRequestError('Reset token has expired');
    }

    // Check if user is globally blocked
    if (user.isGloballyBlocked === 'true') {
      throw new ForbiddenError('Account is globally blocked. Contact support.');
    }

    // Validate new password
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestError('Password must be at least 6 characters long');
    }

    // Hash new password
    const newPasswordHash = await this.hashPassword(newPassword);

    // Update password and clear reset token
    await db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        resetPasswordToken: null,
        resetPasswordExpires: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    logger.info(`Password reset successful for user: ${user.id}`);
  }

  // Global User Blocking - Block user globally (admin only)
  async globalBlockUser(
    userId: string,
    adminId: string,
    reason: string
  ): Promise<User> {
    const user = await this.getUserById(userId);

    if (user.isGloballyBlocked === 'true') {
      throw new BadRequestError('User is already globally blocked');
    }

    const [blockedUser] = await db
      .update(users)
      .set({
        isGloballyBlocked: 'true',
        globalBlockReason: reason,
        globalBlockedAt: new Date(),
        globalBlockedBy: adminId,
        status: 'blocked',
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    logger.info(
      `User ${userId} globally blocked by admin ${adminId}. Reason: ${reason}`
    );
    return blockedUser;
  }

  // Global User Unblocking - Unblock user globally (admin only)
  async globalUnblockUser(userId: string): Promise<User> {
    const user = await this.getUserById(userId);

    if (user.isGloballyBlocked !== 'true') {
      throw new BadRequestError('User is not globally blocked');
    }

    const [unblockedUser] = await db
      .update(users)
      .set({
        isGloballyBlocked: 'false',
        globalBlockReason: null,
        globalBlockedAt: null,
        globalBlockedBy: null,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    logger.info(`User ${userId} globally unblocked`);
    return unblockedUser;
  }

  // Check if user is globally blocked
  async isGloballyBlocked(userId: string): Promise<boolean> {
    const user = await this.getUserById(userId);
    return user.isGloballyBlocked === 'true';
  }

  // Get globally blocked users (admin only)
  async getGloballyBlockedUsers(
    limit: number = 100,
    offset: number = 0
  ): Promise<User[]> {
    return db
      .select()
      .from(users)
      .where(eq(users.isGloballyBlocked, 'true'))
      .limit(limit)
      .offset(offset);
  }

  // Phone Verification Methods

  // Generate and store phone verification OTP
  async generatePhoneVerificationOTP(userId: string): Promise<string> {
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash the OTP before storing
    const hashedOTP = this.hashData(otp);

    // Set expiry to 10 minutes from now
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Store hashed OTP and expiry in database
    await db
      .update(users)
      .set({
        phoneVerificationCode: hashedOTP,
        phoneVerificationExpires: expiresAt,
      })
      .where(eq(users.id, userId));

    logger.info(`Phone verification OTP generated for user ${userId}`);

    // Return the plain OTP to send via SMS
    return otp;
  }

  // Verify phone OTP
  async verifyPhoneOTP(userId: string, otp: string): Promise<boolean> {
    const user = await this.getUserById(userId);

    if (!user.phoneVerificationCode || !user.phoneVerificationExpires) {
      throw new BadRequestError(
        'No verification code found. Please request a new code.'
      );
    }

    // Check if OTP has expired
    if (new Date() > user.phoneVerificationExpires) {
      throw new BadRequestError(
        'Verification code has expired. Please request a new code.'
      );
    }

    // Hash the provided OTP and compare
    const hashedOTP = this.hashData(otp);

    if (hashedOTP !== user.phoneVerificationCode) {
      throw new BadRequestError('Invalid verification code.');
    }

    // Mark phone as verified and clear verification fields
    await db
      .update(users)
      .set({
        isPhoneVerified: 'true',
        phoneVerificationCode: null,
        phoneVerificationExpires: null,
      })
      .where(eq(users.id, userId));

    logger.info(`Phone verified successfully for user ${userId}`);
    return true;
  }

  // Check if user's phone is verified
  async isPhoneVerified(userId: string): Promise<boolean> {
    const user = await this.getUserById(userId);
    return user.isPhoneVerified === 'true';
  }

  // Resend phone verification OTP
  async resendPhoneVerificationOTP(userId: string): Promise<string> {
    const user = await this.getUserById(userId);

    if (!user.phone) {
      throw new BadRequestError(
        'No phone number associated with this account.'
      );
    }

    if (user.isPhoneVerified === 'true') {
      throw new BadRequestError('Phone number is already verified.');
    }

    // Generate new OTP
    return this.generatePhoneVerificationOTP(userId);
  }

  // Reset password using user ID (after OTP verification)
  async resetPasswordWithUserId(
    userId: string,
    newPassword: string
  ): Promise<void> {
    // Validate password
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestError('Password must be at least 6 characters long');
    }

    // Hash new password
    const passwordHash = await this.hashPassword(newPassword);

    // Update password
    await db
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    logger.info(`Password reset successfully for user ${userId}`);
  }

  // ==================== USER BLOCKING METHODS ====================

  async blockUserById(
    blockerId: string,
    blockedUserId: string,
    reason?: string
  ): Promise<void> {
    if (blockerId === blockedUserId) {
      throw new BadRequestError('Cannot block yourself');
    }

    // Verify both users exist
    await this.getUserById(blockerId);
    await this.getUserById(blockedUserId);

    try {
      await db.insert(userBlocks).values({
        id: uuidv4(),
        blockerId,
        blockedUserId,
        reason,
      });

      logger.info(
        `User ${blockerId} blocked user ${blockedUserId}${reason ? ` for reason: ${reason}` : ''}`
      );
    } catch (error: any) {
      // Handle unique constraint violation (user already blocked)
      if (error.code === '23505') {
        throw new BadRequestError('User is already blocked');
      }
      throw error;
    }
  }

  async unblockUserById(
    blockerId: string,
    blockedUserId: string
  ): Promise<void> {
    const result = await db
      .delete(userBlocks)
      .where(
        and(
          eq(userBlocks.blockerId, blockerId),
          eq(userBlocks.blockedUserId, blockedUserId)
        )
      );

    logger.info(`User ${blockerId} unblocked user ${blockedUserId}`);
  }

  async isUserBlocked(
    blockerId: string,
    blockedUserId: string
  ): Promise<boolean> {
    const [block] = await db
      .select()
      .from(userBlocks)
      .where(
        and(
          eq(userBlocks.blockerId, blockerId),
          eq(userBlocks.blockedUserId, blockedUserId)
        )
      )
      .limit(1);

    return !!block;
  }

  async getBlockedUsers(
    blockerId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<User[]> {
    const blockedUserIds = await db
      .select({ blockedUserId: userBlocks.blockedUserId })
      .from(userBlocks)
      .where(eq(userBlocks.blockerId, blockerId))
      .limit(limit)
      .offset(offset);

    if (blockedUserIds.length === 0) {
      return [];
    }

    const userIds = blockedUserIds.map(b => b.blockedUserId);
    return db
      .select()
      .from(users)
      .where(
        and(
          eq(users.status, 'active'),
          or(...userIds.map(id => eq(users.id, id)))
        )
      );
  }

  async getUsersWhoBlockedMe(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<User[]> {
    const blockerIds = await db
      .select({ blockerId: userBlocks.blockerId })
      .from(userBlocks)
      .where(eq(userBlocks.blockedUserId, userId))
      .limit(limit)
      .offset(offset);

    if (blockerIds.length === 0) {
      return [];
    }

    const userIds = blockerIds.map(b => b.blockerId);
    return db
      .select()
      .from(users)
      .where(
        and(
          eq(users.status, 'active'),
          or(...userIds.map(id => eq(users.id, id)))
        )
      );
  }

  // ==================== DEVICE TOKEN METHODS ====================

  async upsertDeviceToken(
    userId: string,
    token: string,
    platform: string,
    deviceId?: string
  ): Promise<void> {
    const { deviceTokens } = await import('../models');

    // Check if token already exists for any user.
    // If it exists for another user (e.g., device changed hands), we might want to overwrite or re-assign.
    // Drizzle currently doesn't have a simple ON CONFLICT for postgres.js without the specific syntax,
    // so let's do a select and update/insert.
    const [existing] = await db
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.token, token))
      .limit(1);

    if (existing) {
      await db
        .update(deviceTokens)
        .set({
          userId,
          platform,
          deviceId: deviceId || null,
          updatedAt: new Date(),
        })
        .where(eq(deviceTokens.id, existing.id));
    } else {
      await db.insert(deviceTokens).values({
        id: uuidv4(),
        userId,
        token,
        platform,
        deviceId: deviceId || null,
      });
    }

    logger.info(`Device token upserted for user ${userId}`);
  }

  async removeDeviceToken(userId: string, token: string): Promise<void> {
    const { deviceTokens } = await import('../models');
    await db
      .delete(deviceTokens)
      .where(
        and(eq(deviceTokens.userId, userId), eq(deviceTokens.token, token))
      );

    logger.info(`Device token removed for user ${userId}`);
  }

  async getUserDeviceTokens(userId: string): Promise<string[]> {
    const { deviceTokens } = await import('../models');
    const tokens = await db
      .select({ token: deviceTokens.token })
      .from(deviceTokens)
      .where(eq(deviceTokens.userId, userId));

    return tokens.map(t => t.token);
  }

  // ==================== GUEST IDENTITY METHODS ====================

  /**
   * Gets or creates a guestId based on a device fingerprint.
   * This prevents guests from regenerating IDs to bypass blocks.
   */
  async getOrCreateGuestId(fingerprint: string): Promise<string> {
    const [existing] = await db
      .select()
      .from(guestIdentifiers)
      .where(eq(guestIdentifiers.fingerprint, fingerprint))
      .limit(1);

    if (existing) {
      // Update last seen
      await db
        .update(guestIdentifiers)
        .set({ lastSeenAt: new Date() })
        .where(eq(guestIdentifiers.id, existing.id));
      return existing.guestId;
    }

    // Create new guestId
    const guestId = uuidv4();
    await db.insert(guestIdentifiers).values({
      id: uuidv4(),
      fingerprint,
      guestId,
    });

    logger.info(
      `New guest identity created: ${guestId} for fingerprint: ${fingerprint}`
    );
    return guestId;
  }

  // ==================== GUEST BLOCKING METHODS ====================

  async blockGuest(
    ownerId: string,
    guestId: string | null,
    ipAddress: string | null,
    reason?: string
  ): Promise<void> {
    if (!guestId && !ipAddress) {
      throw new BadRequestError('Either guestId or ipAddress must be provided');
    }

    await db.insert(blockedGuests).values({
      id: uuidv4(),
      ownerId,
      guestId,
      ipAddress,
      reason,
    });

    logger.info(
      `Guest blocked by owner ${ownerId}: ID=${guestId}, IP=${ipAddress}`
    );
  }

  async unblockGuest(ownerId: string, guestIdOrIp: string): Promise<void> {
    await db
      .delete(blockedGuests)
      .where(
        and(
          eq(blockedGuests.ownerId, ownerId),
          or(
            eq(blockedGuests.guestId, guestIdOrIp),
            eq(blockedGuests.ipAddress, guestIdOrIp)
          )
        )
      );

    logger.info(`Guest ${guestIdOrIp} unblocked by owner ${ownerId}`);
  }

  async isGuestBlocked(
    ownerId: string,
    guestId: string | null,
    ipAddress: string | null
  ): Promise<boolean> {
    if (!guestId && !ipAddress) return false;

    const conditions = [];
    if (guestId) conditions.push(eq(blockedGuests.guestId, guestId));
    if (ipAddress) conditions.push(eq(blockedGuests.ipAddress, ipAddress));

    if (conditions.length === 0) return false;

    const [block] = await db
      .select()
      .from(blockedGuests)
      .where(and(eq(blockedGuests.ownerId, ownerId), or(...conditions)))
      .limit(1);

    return !!block;
  }
}

export const userService = new UserService();
