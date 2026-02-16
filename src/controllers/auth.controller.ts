import { Response } from 'express';
import { userService } from '../services/user.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { asyncHandler } from '../utils';
import { sendSuccessResponse } from '../utils/responseHandler';
import { generateAccessToken } from '../utils/jwt';

export class AuthController {
  register = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { username, password, phone, email } = req.body;

    const user = await userService.createUser({ username, password, phone, email });

    // Generate JWT token
    const token = generateAccessToken({ userId: user.id, username: user.username });

    sendSuccessResponse(res, 201, 'User registered successfully', {
      token,
      user: {
        id: user.id,
        username: user.username,
        status: user.status,
        createdAt: user.createdAt,
      },
    });
  });

  login = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { username, password } = req.body;

    const user = await userService.authenticateUser(username, password);

    // Generate JWT token
    const token = generateAccessToken({ userId: user.id, username: user.username });

    sendSuccessResponse(res, 200, 'Login successful', {
      token,
      user: {
        id: user.id,
        username: user.username,
        status: user.status,
        createdAt: user.createdAt,
      },
    });
  });

  changePassword = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const { oldPassword, newPassword } = req.body;

    await userService.changePassword(userId, oldPassword, newPassword);

    sendSuccessResponse(res, 200, 'Password changed successfully', null);
  });

  getProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const user = await userService.getUserById(userId);

    sendSuccessResponse(res, 200, 'Profile retrieved successfully', {
      id: user.id,
      username: user.username,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  });
}

export const authController = new AuthController();
