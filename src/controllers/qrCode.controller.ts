import { Response } from 'express';
import { qrCodeService } from '../services/qrCode.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { asyncHandler } from '../utils';
import { sendSuccessResponse } from '../utils/responseHandler';

export class QRCodeController {
  createQRCode = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const qrCode = await qrCodeService.createQRCode();

      sendSuccessResponse(res, 201, 'QR code created successfully', {
        id: qrCode.id,
        token: qrCode.token,
        humanToken: qrCode.humanToken,
        status: qrCode.status,
        createdAt: qrCode.createdAt,
      });
    }
  );

  bulkCreateQRCodes = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { count } = req.body;
      const qrCodes = await qrCodeService.bulkCreateQRCodes(count);

      sendSuccessResponse(res, 201, `${count} QR codes created successfully`, {
        count: qrCodes.length,
        qrCodes: qrCodes.map(qr => ({
          id: qr.id,
          token: qr.token,
          humanToken: qr.humanToken,
          status: qr.status,
          createdAt: qr.createdAt,
        })),
      });
    }
  );

  claimQRCode = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const userId = req.user!.userId;
      const { token, humanToken } = req.body;

      const qrCode = await qrCodeService.claimQRCode(userId, token, humanToken);

      sendSuccessResponse(res, 200, 'QR code claimed successfully', {
        id: qrCode.id,
        token: qrCode.token,
        humanToken: qrCode.humanToken,
        assignedUserId: qrCode.assignedUserId,
        status: qrCode.status,
        assignedAt: qrCode.assignedAt,
      });
    }
  );

  assignQRCode = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { qrCodeId } = req.params;
      const { userId } = req.body;

      const qrCode = await qrCodeService.assignQRCode(qrCodeId, userId);

      sendSuccessResponse(res, 200, 'QR code assigned successfully', {
        id: qrCode.id,
        token: qrCode.token,
        assignedUserId: qrCode.assignedUserId,
        status: qrCode.status,
        assignedAt: qrCode.assignedAt,
      });
    }
  );

  scanQRCode = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { token, humanToken } = req.body;
      const result = await qrCodeService.scanQRCode(token, humanToken);

      sendSuccessResponse(res, 200, 'QR code scanned successfully', {
        qrCode: {
          id: result.qrCode.id,
          token: result.qrCode.token,
          humanToken: result.qrCode.humanToken,
          status: result.qrCode.status,
        },
        user: result.user,
      });
    }
  );

  getMyQRCodes = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const userId = req.user!.userId;
      const qrCodes = await qrCodeService.getUserQRCodes(userId);

      sendSuccessResponse(res, 200, 'QR codes retrieved successfully', {
        qrCodes: qrCodes.map(qr => ({
          id: qr.id,
          token: qr.token,
          humanToken: qr.humanToken,
          status: qr.status,
          assignedAt: qr.assignedAt,
          createdAt: qr.createdAt,
        })),
      });
    }
  );

  getUnassignedQRCodes = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const qrCodes = await qrCodeService.getUnassignedQRCodes(limit);

      sendSuccessResponse(
        res,
        200,
        'Unassigned QR codes retrieved successfully',
        {
          qrCodes: qrCodes.map(qr => ({
            id: qr.id,
            token: qr.token,
            humanToken: qr.humanToken,
            status: qr.status,
            createdAt: qr.createdAt,
          })),
        }
      );
    }
  );

  revokeQRCode = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { qrCodeId } = req.params;
      const userId = req.user!.userId;

      const qrCode = await qrCodeService.revokeQRCode(qrCodeId, userId);

      sendSuccessResponse(res, 200, 'QR code revoked successfully', {
        id: qrCode.id,
        status: qrCode.status,
      });
    }
  );

  disableQRCode = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { qrCodeId } = req.params;
      const userId = req.user!.userId;

      const qrCode = await qrCodeService.disableQRCode(qrCodeId, userId);

      sendSuccessResponse(res, 200, 'QR code disabled successfully', {
        id: qrCode.id,
        status: qrCode.status,
      });
    }
  );

  reactivateQRCode = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { qrCodeId } = req.params;
      const userId = req.user!.userId;

      const qrCode = await qrCodeService.reactivateQRCode(qrCodeId, userId);

      sendSuccessResponse(res, 200, 'QR code reactivated successfully', {
        id: qrCode.id,
        status: qrCode.status,
      });
    }
  );

  getQRCodeImage = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { token } = req.params;
      const dataURL = await qrCodeService.generateQRCodeImage(token);

      sendSuccessResponse(res, 200, 'QR code image generated successfully', {
        image: dataURL,
      });
    }
  );
}

export const qrCodeController = new QRCodeController();
