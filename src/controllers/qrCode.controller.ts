import { Request, Response } from 'express';
import { qrCodeService } from '../services/qrCode.service';
import { userService } from '../services/user.service';
import {
  logger,
  UnauthorizedError,
  NotFoundError,
  sendSuccessResponse
} from '../utils';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export class QRCodeController {
  async createQRCode(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) {
      throw new UnauthorizedError();
    }

    const { expiresAt } = req.body;

    // Create QR code
    const qrCode = await qrCodeService.createQRCode(
      userId,
      expiresAt ? new Date(expiresAt) : undefined
    );

    // Generate QR code image
    const qrCodeDataURL = await qrCodeService.generateQRCodeDataURL(qrCode.token);

    logger.info(`QR code created for user: ${userId}`);

    sendSuccessResponse(res, 201, 'QR code created successfully', {
      qrCode: {
        id: qrCode.id,
        token: qrCode.token,
        isActive: qrCode.isActive,
        expiresAt: qrCode.expiresAt,
        scanCount: qrCode.scanCount,
        createdAt: qrCode.createdAt,
      },
      qrCodeDataURL,
    });
  }

  async scanQRCode(req: Request, res: Response) {
    const { token } = req.body;

    // Validate QR code
    const qrCode = await qrCodeService.validateQRCode(token);
    if (!qrCode) {
      throw new NotFoundError('Invalid or expired QR code');
    }

    // Get user profile for this QR code
    const user = await userService.getUserById(qrCode.userId);
    if (!user || !user.isActive) {
      throw new NotFoundError('QR code owner not found or inactive');
    }

    // Update scan count
    await qrCodeService.updateScanCount(token);

    logger.info(`QR code scanned: ${qrCode.id}, user: ${user.id}`);

    sendSuccessResponse(res, 200, 'QR code scanned successfully', {
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
    });
  }

  async getUserQRCodes(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) {
      throw new UnauthorizedError();
    }

    const qrCodes = await qrCodeService.getUserQRCodes(userId);

    sendSuccessResponse(res, 200, undefined, {
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
    });
  }

  async revokeQRCode(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    const { qrCodeId } = req.params;

    if (!userId) {
      throw new UnauthorizedError();
    }

    const success = await qrCodeService.revokeQRCode(qrCodeId, userId);

    if (!success) {
      throw new NotFoundError('QR code not found or you do not have permission to revoke it');
    }

    logger.info(`QR code revoked: ${qrCodeId} by user: ${userId}`);

    sendSuccessResponse(res, 200, 'QR code revoked successfully');
  }

  async getQRCodeImage(req: Request, res: Response) {
    const { token } = req.params;

    // Validate QR code
    const qrCode = await qrCodeService.validateQRCode(token);
    if (!qrCode) {
      throw new NotFoundError('Invalid or expired QR code');
    }

    // Generate QR code image
    const qrCodeDataURL = await qrCodeService.generateQRCodeDataURL(token);

    // Return the image data URL
    sendSuccessResponse(res, 200, undefined, {
      qrCodeDataURL,
    });
  }
}

export const qrCodeController = new QRCodeController();
