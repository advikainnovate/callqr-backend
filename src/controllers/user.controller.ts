import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { userService } from '../services/user.service';
import { registerUserSchema, loginUserSchema, updateProfileSchema, changePasswordSchema } from '../schemas/user.schema';
import { logger } from '../utils';
import jwt from 'jsonwebtoken';
import { appConfig } from '../config';
import { qrCodeService } from '../services/qrCode.service';

export class UserController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = registerUserSchema.parse(req.body);

      // Check for uniqueness
      const [emailUser, usernameUser, phoneUser] = await Promise.all([
        userService.getUserByEmail(validatedData.email),
        userService.getUserByUsername(validatedData.username),
        userService.getUserByPhone(validatedData.phoneNo)
      ]);

      if (emailUser || usernameUser || phoneUser) {
        let field = emailUser ? 'Email' : usernameUser ? 'Username' : 'Phone number';
        return res.status(409).json({
          success: false,
          message: `${field} already exists`,
        });
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(validatedData.password, saltRounds);

      // Create new user (remove plain password, add hash)
      const { password, ...userToCreate } = validatedData;
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

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
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
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.issues,
        });
      }
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = loginUserSchema.parse(req.body);

      // Find user by email or username
      let user;
      if (validatedData.email) {
        user = await userService.getUserByEmail(validatedData.email);
      } else if (validatedData.username) {
        user = await userService.getUserByUsername(validatedData.username);
      }

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials',
        });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(validatedData.password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials',
        });
      }

      // Check if user is active
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated',
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        appConfig.jwt.secret,
        { expiresIn: '7d' }
      );

      logger.info(`User logged in successfully: ${user.id}`);

      res.json({
        success: true,
        message: 'Login successful',
        data: {
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
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.issues,
        });
      }
      next(error);
    }
  }

  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const user = await userService.getUserById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      res.json({
        success: true,
        data: {
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
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.userId;
      const validatedData = updateProfileSchema.parse(req.body);

      // If updating unique fields, check for collisions
      if (validatedData.email || validatedData.username || validatedData.phoneNo) {
        const checks = [];
        if (validatedData.email) checks.push(userService.getUserByEmail(validatedData.email));
        if (validatedData.username) checks.push(userService.getUserByUsername(validatedData.username));
        if (validatedData.phoneNo) checks.push(userService.getUserByPhone(validatedData.phoneNo));

        const results = await Promise.all(checks);
        const collision = results.find(u => u && u.id !== userId);

        if (collision) {
          return res.status(409).json({
            success: false,
            message: 'One of the provided unique fields (email, username, or phone) is already taken',
          });
        }
      }

      const updatedUser = await userService.updateUser(userId, validatedData);

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: {
            id: updatedUser?.id,
            username: updatedUser?.username,
            email: updatedUser?.email,
            phoneNo: updatedUser?.phoneNo,
            emergencyNo: updatedUser?.emergencyNo,
            vehicleType: updatedUser?.vehicleType,
            isActive: updatedUser?.isActive,
          },
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.issues,
        });
      }
      next(error);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.userId;
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

      const user = await userService.getUserById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Verify current password
      const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Incorrect current password',
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await userService.updateUser(userId, { passwordHash: hashedPassword });

      res.json({
        success: true,
        message: 'Password updated successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.issues,
        });
      }
      next(error);
    }
  }
  async deleteAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.userId;
      await userService.deactivateUser(userId);

      res.json({
        success: true,
        message: 'Account deactivated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
