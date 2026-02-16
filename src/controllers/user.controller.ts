import { Response } from 'express';
import { userService } from '../services/user.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { asyncHandler } from '../utils';
import { sendSuccessResponse } from '../utils/responseHandler';

export class UserController {
  getUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { userId } = req.params;
    const user = await userService.getUserById(userId);

    sendSuccessResponse(res, 200, 'User retrieved successfully', {
      id: user.id,
      username: user.username,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
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

  updateUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { userId } = req.params;
    const updateData = req.body;

    const user = await userService.updateUser(userId, updateData);

    sendSuccessResponse(res, 200, 'User updated successfully', {
      id: user.id,
      username: user.username,
      status: user.status,
      updatedAt: user.updatedAt,
    });
  });

  blockUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { userId } = req.params;
    const user = await userService.blockUser(userId);

    sendSuccessResponse(res, 200, 'User blocked successfully', {
      id: user.id,
      status: user.status,
    });
  });

  deleteUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { userId } = req.params;
    const user = await userService.deleteUser(userId);

    sendSuccessResponse(res, 200, 'User deleted successfully', {
      id: user.id,
      status: user.status,
    });
  });

  activateUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { userId } = req.params;
    const user = await userService.activateUser(userId);

    sendSuccessResponse(res, 200, 'User activated successfully', {
      id: user.id,
      status: user.status,
    });
  });

  verifyPhone = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { phone } = req.body;
    const user = await userService.verifyPhone(phone);

    if (user) {
      sendSuccessResponse(res, 200, 'Phone verified', {
        exists: true,
        userId: user.id,
      });
    } else {
      sendSuccessResponse(res, 200, 'Phone not found', {
        exists: false,
      });
    }
  });

  verifyEmail = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { email } = req.body;
    const user = await userService.verifyEmail(email);

    if (user) {
      sendSuccessResponse(res, 200, 'Email verified', {
        exists: true,
        userId: user.id,
      });
    } else {
      sendSuccessResponse(res, 200, 'Email not found', {
        exists: false,
      });
    }
  });
}

export const userController = new UserController();
