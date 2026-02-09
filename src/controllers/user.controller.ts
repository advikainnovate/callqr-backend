import { Request, Response } from 'express';
import { userService } from '../services/user.service';
import {
  logger,
  UnauthorizedError,
  sendSuccessResponse
} from '../utils';
import jwt from 'jsonwebtoken';
import { appConfig } from '../config';
import { qrCodeService } from '../services/qrCode.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export class UserController {
  async register(req: Request, res: Response) {
    const user = await userService.register(req.body);

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      appConfig.jwt.secret,
      { expiresIn: '7d' }
    );

    // Automatically create a permanent QR code for the new user
    try {
      await qrCodeService.createQRCode(user.id);
      logger.info(`Automatic QR code created for new user: ${user.id}`);
    } catch (qrError) {
      logger.error(`Failed to auto-create QR code for user ${user.id}:`, qrError);
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
    const user = await userService.login(req.body);

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
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) throw new UnauthorizedError();

    const user = await userService.getUserById(userId);

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
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) throw new UnauthorizedError();

    const updatedUser = await userService.updateProfile(userId, req.body);

    sendSuccessResponse(res, 200, 'Profile updated successfully', {
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        phoneNo: updatedUser.phoneNo,
        emergencyNo: updatedUser.emergencyNo,
        vehicleType: updatedUser.vehicleType,
        isActive: updatedUser.isActive,
      },
    });
  }

  async changePassword(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) throw new UnauthorizedError();

    const { currentPassword, newPassword } = req.body;
    await userService.changePassword(userId, currentPassword, newPassword);

    sendSuccessResponse(res, 200, 'Password updated successfully');
  }

  async deleteAccount(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) throw new UnauthorizedError();

    await userService.deactivateUser(userId);

    sendSuccessResponse(res, 200, 'Account deactivated successfully');
  }
}

export const userController = new UserController();
