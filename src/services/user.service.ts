import { eq, or } from 'drizzle-orm';
import { db } from '../db';
import { users, type NewUser, type User } from '../models';
import { v4 as uuidv4 } from 'uuid';
import { logger, ConflictError, NotFoundError, BadRequestError } from '../utils';
import crypto from 'crypto';

export class UserService {
  private hashData(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  async createUser(userData: {
    username: string;
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

    // Hash phone and email if provided
    const phoneHash = userData.phone ? this.hashData(userData.phone) : null;
    const emailHash = userData.email ? this.hashData(userData.email) : null;

    // Create new user
    const [user] = await db
      .insert(users)
      .values({
        id: uuidv4(),
        username: userData.username,
        phoneHash,
        emailHash,
        status: 'active',
      })
      .returning();

    logger.info(`User created successfully: ${user.id}`);
    return user;
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
}

export const userService = new UserService();
