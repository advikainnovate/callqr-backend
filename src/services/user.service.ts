import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users, type NewUser, type User } from '../models';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils';

export class UserService {
  async createUser(userData: NewUser): Promise<User> {
    try {
      const [user] = await db
        .insert(users)
        .values({
          ...userData,
          id: uuidv4(),
        })
        .returning();

      logger.info(`User created successfully: ${user.id}`);
      return user;
    } catch (error) {
      logger.error('Error creating user:', error);
      throw error;
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      return user || null;
    } catch (error) {
      logger.error('Error fetching user by email:', error);
      throw error;
    }
  }

  async getUserByUsername(username: string): Promise<User | null> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      return user || null;
    } catch (error) {
      logger.error('Error fetching user by username:', error);
      throw error;
    }
  }

  async getUserByPhone(phoneNo: string): Promise<User | null> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.phoneNo, phoneNo))
        .limit(1);

      return user || null;
    } catch (error) {
      logger.error('Error fetching user by phone:', error);
      throw error;
    }
  }

  async getUserById(id: string): Promise<User | null> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      return user || null;
    } catch (error) {
      logger.error('Error fetching user by ID:', error);
      throw error;
    }
  }

  async updateUser(id: string, userData: Partial<NewUser>): Promise<User | null> {
    try {
      const [user] = await db
        .update(users)
        .set({ ...userData, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();

      return user || null;
    } catch (error) {
      logger.error('Error updating user:', error);
      throw error;
    }
  }

  async deactivateUser(id: string): Promise<boolean> {
    try {
      const [user] = await db
        .update(users)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();

      return !!user;
    } catch (error) {
      logger.error('Error deactivating user:', error);
      throw error;
    }
  }
}

export const userService = new UserService();
