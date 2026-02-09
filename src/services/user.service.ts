import { eq, or, and, ne } from 'drizzle-orm';
import { db } from '../db';
import { users, type NewUser, type User } from '../models';
import { v4 as uuidv4 } from 'uuid';
import { logger, ConflictError, UnauthorizedError, NotFoundError } from '../utils';
import bcrypt from 'bcrypt';

export class UserService {
  async register(userData: any): Promise<User> {
    // Check for uniqueness
    const existingUser = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.email, userData.email),
          eq(users.username, userData.username),
          eq(users.phoneNo, userData.phoneNo)
        )
      )
      .limit(1);

    if (existingUser.length > 0) {
      const user = existingUser[0];
      let field = 'User';
      if (user.email === userData.email) field = 'Email';
      else if (user.username === userData.username) field = 'Username';
      else if (user.phoneNo === userData.phoneNo) field = 'Phone number';

      throw new ConflictError(`${field} already exists`);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    // Create new user
    const { password, ...userToCreate } = userData;
    const [user] = await db
      .insert(users)
      .values({
        ...userToCreate,
        id: uuidv4(),
        passwordHash: hashedPassword,
      })
      .returning();

    logger.info(`User registered successfully: ${user.id}`);
    return user;
  }

  async login(loginData: { email?: string; username?: string; password: string }): Promise<User> {
    let user: User | undefined;

    if (loginData.email) {
      user = (await db.select().from(users).where(eq(users.email, loginData.email)).limit(1))[0];
    } else if (loginData.username) {
      user = (await db.select().from(users).where(eq(users.username, loginData.username)).limit(1))[0];
    }

    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(loginData.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated');
    }

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

  async updateProfile(userId: string, updateData: any): Promise<User> {
    // If updating unique fields, check for collisions
    if (updateData.email || updateData.username || updateData.phoneNo) {
      const conditions = [];
      if (updateData.email) conditions.push(eq(users.email, updateData.email));
      if (updateData.username) conditions.push(eq(users.username, updateData.username));
      if (updateData.phoneNo) conditions.push(eq(users.phoneNo, updateData.phoneNo));

      const collision = await db
        .select()
        .from(users)
        .where(
          and(
            ne(users.id, userId),
            or(...conditions)
          )
        )
        .limit(1);

      if (collision.length > 0) {
        throw new ConflictError('One of the provided unique fields (email, username, or phone) is already taken');
      }
    }

    const [updatedUser] = await db
      .update(users)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) {
      throw new NotFoundError('User not found');
    }

    return updatedUser;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.getUserById(userId);

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Incorrect current password');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db
      .update(users)
      .set({ passwordHash: hashedPassword, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async deactivateUser(id: string): Promise<void> {
    const [user] = await db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    if (!user) {
      throw new NotFoundError('User not found');
    }
  }

  // Basic fetchers kept for internal use or other services if needed
  async getUserByEmail(email: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user || null;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return user || null;
  }

  async getUserByPhone(phoneNo: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.phoneNo, phoneNo)).limit(1);
    return user || null;
  }
}

export const userService = new UserService();
