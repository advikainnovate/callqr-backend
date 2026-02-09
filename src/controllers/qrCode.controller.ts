import { Request, Response } from 'express';
import { qrCodeService } from '../services/qrCode.service';
import {
  UnauthorizedError,
  sendSuccessResponse
} from '../utils';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export class QRCodeController {
  async createQRCode(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) throw new UnauthorizedError();

    const { expiresAt } = req.body;
    const qrCode = await qrCodeService.createQRCode(
      userId,
      expiresAt ? new Date(expiresAt) : undefined
    );

    const qrCodeDataURL = await qrCodeService.generateQRCodeDataURL(qrCode.token);

    sendSuccessResponse(res, 201, 'QR code created successfully', {
      qrCode,
      qrCodeDataURL,
    });
  }

  async scanQRCode(req: Request, res: Response) {
    const { token } = req.body;
    const { qrCode, user } = await qrCodeService.scanQRCode(token);

    sendSuccessResponse(res, 200, 'QR code scanned successfully', {
      qrCodeId: qrCode.id,
      userId: qrCode.userId,
      scanCount: qrCode.scanCount + 1,
      user: {
        id: user.id,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
    });
  }

  async getUserQRCodes(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) throw new UnauthorizedError();

    const qrCodes = await qrCodeService.getUserQRCodes(userId);

    sendSuccessResponse(res, 200, undefined, { qrCodes });
  }

  async revokeQRCode(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) throw new UnauthorizedError();

    const { qrCodeId } = req.params;
    await qrCodeService.revokeQRCode(qrCodeId, userId);

    sendSuccessResponse(res, 200, 'QR code revoked successfully');
  }

  async getQRCodeImage(req: Request, res: Response) {
    const { token } = req.params;
    await qrCodeService.validateQRCode(token);
    const qrCodeDataURL = await qrCodeService.generateQRCodeDataURL(token);

    sendSuccessResponse(res, 200, undefined, { qrCodeDataURL });
  }
}

export const qrCodeController = new QRCodeController();
