import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { userService } from '../services/user.service';
import {
  logger,
  UnauthorizedError,
  ConflictError,
  NotFoundError,
  sendSuccessResponse
} from '../utils';
import jwt from 'jsonwebtoken';
import { appConfig } from '../config';
import { qrCodeService } from '../services/qrCode.service';

export class UserController {
  async register(req: Request, res: Response) {
    const userData = req.body;

    // Check for uniqueness
    const [emailUser, usernameUser, phoneUser] = await Promise.all([
      userService.getUserByEmail(userData.email),
      userService.getUserByUsername(userData.username),
      userService.getUserByPhone(userData.phoneNo)
    ]);

    if (emailUser || usernameUser || phoneUser) {
      const field = emailUser ? 'Email' : usernameUser ? 'Username' : 'Phone number';
      throw new ConflictError(`${field} already exists`);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    // Create new user (remove plain password, add hash)
    const { password, ...userToCreate } = userData;
    const user = await userService.createUser({
      ...userToCreate,
      passwordHash: hashedPassword
    });

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      appConfig.jwt.secret,
      { expiresIn: '7d' }
    );

    logger.info(`User registered successfully: ${user.id}`);

    // Automatically create a permanent QR code for the new user
    try {
      await qrCodeService.createQRCode(user.id);
      logger.info(`Automatic QR code created for new user: ${user.id}`);
    } catch (qrError) {
      logger.error(`Failed to auto-create QR code for user ${user.id}:`, qrError);
      // We don't fail registration if QR creation fails, but we log it
    }

    sendSuccessResponse(res, 201, 'User registered successfully', {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phoneNo: user.phoneNo,
        vehicleType: user.vehicleType,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
      token,
    });
  }

  async login(req: Request, res: Response) {
    const loginData = req.body;

    // Find user by email or username
    let user;
    if (loginData.email) {
      user = await userService.getUserByEmail(loginData.email);
    } else if (loginData.username) {
      user = await userService.getUserByUsername(loginData.username);
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

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      appConfig.jwt.secret,
      { expiresIn: '7d' }
    );

    logger.info(`User logged in successfully: ${user.id}`);

    sendSuccessResponse(res, 200, 'Login successful', {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phoneNo: user.phoneNo,
        vehicleType: user.vehicleType,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
      token,
    });
  }

  async getProfile(req: Request, res: Response) {
    const userId = (req as any).user?.userId;

    if (!userId) {
      throw new UnauthorizedError();
    }

    const user = await userService.getUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    sendSuccessResponse(res, 200, undefined, {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phoneNo: user.phoneNo,
        emergencyNo: user.emergencyNo,
        vehicleType: user.vehicleType,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
    });
  }

  async updateProfile(req: Request, res: Response) {
    const userId = (req as any).user?.userId;
    const updateData = req.body;

    // If updating unique fields, check for collisions
    if (updateData.email || updateData.username || updateData.phoneNo) {
      const checks = [];
      if (updateData.email) checks.push(userService.getUserByEmail(updateData.email));
      if (updateData.username) checks.push(userService.getUserByUsername(updateData.username));
      if (updateData.phoneNo) checks.push(userService.getUserByPhone(updateData.phoneNo));

      const results = await Promise.all(checks);
      const collision = results.find(u => u && u.id !== userId);

      if (collision) {
        throw new ConflictError('One of the provided unique fields (email, username, or phone) is already taken');
      }
    }

    const updatedUser = await userService.updateUser(userId, updateData);

    sendSuccessResponse(res, 200, 'Profile updated successfully', {
      user: {
        id: updatedUser?.id,
        username: updatedUser?.username,
        email: updatedUser?.email,
        phoneNo: updatedUser?.phoneNo,
        emergencyNo: updatedUser?.emergencyNo,
        vehicleType: updatedUser?.vehicleType,
        isActive: updatedUser?.isActive,
      },
    });
  }

  async changePassword(req: Request, res: Response) {
    const userId = (req as any).user?.userId;
    const { currentPassword, newPassword } = req.body;

    const user = await userService.getUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Incorrect current password');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await userService.updateUser(userId, { passwordHash: hashedPassword });

    sendSuccessResponse(res, 200, 'Password updated successfully');
  }

  async deleteAccount(req: Request, res: Response) {
    const userId = (req as any).user?.userId;
    await userService.deactivateUser(userId);

    sendSuccessResponse(res, 200, 'Account deactivated successfully');
  }
}

export const userController = new UserController();
