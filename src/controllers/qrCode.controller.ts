import { Response } from 'express';
import { qrCodeService } from '../services/qrCode.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { asyncHandler, UnauthorizedError } from '../utils';
import { sendSuccessResponse } from '../utils/responseHandler';

export class QRCodeController {
  createQRCode = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { redirectUrl, isRedirectEnabled } = req.body;
      const qrCode = await qrCodeService.createQRCode(
        redirectUrl,
        isRedirectEnabled
      );

      sendSuccessResponse(res, 201, 'QR code created successfully', {
        id: qrCode.id,
        token: qrCode.token,
        humanToken: qrCode.humanToken,
        status: qrCode.status,
        redirectUrl: qrCode.redirectUrl,
        isRedirectEnabled: qrCode.isRedirectEnabled,
        createdAt: qrCode.createdAt,
      });
    }
  );

  bulkCreateQRCodes = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { count, redirectUrl, isRedirectEnabled } = req.body;
      const qrCodes = await qrCodeService.bulkCreateQRCodes(
        count,
        redirectUrl,
        isRedirectEnabled
      );

      sendSuccessResponse(res, 201, `${count} QR codes created successfully`, {
        count: qrCodes.length,
        qrCodes: qrCodes.map(qr => ({
          id: qr.id,
          token: qr.token,
          humanToken: qr.humanToken,
          status: qr.status,
          redirectUrl: qr.redirectUrl,
          isRedirectEnabled: qr.isRedirectEnabled,
          createdAt: qr.createdAt,
        })),
      });
    }
  );

  claimQRCode = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;
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
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;
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
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const cursor = req.query.cursor as string | undefined;

      const result = await qrCodeService.getUnassignedQRCodes(limit, cursor);

      const baseUrl =
        process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;

      sendSuccessResponse(
        res,
        200,
        'Unassigned QR codes retrieved successfully',
        {
          data: result.data.map(qr => ({
            id: qr.id,
            code: qr.humanToken,
            imageUrl: `${baseUrl}/api/qr-codes/image/${qr.token}`,
            createdAt: qr.createdAt,
          })),
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
        }
      );
    }
  );

  revokeQRCode = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { qrCodeId } = req.params;
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;

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
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;

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
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;

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

      const base64Data = dataURL.replace(/^data:image\/png;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.send(buffer);
    }
  );

  handleQRScan = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { token } = req.params;
      const userAgent = req.headers['user-agent'] || '';
      const isApp =
        req.query.app === 'true' ||
        (process.env.OFFICIAL_APP_UA_PART &&
          userAgent.includes(process.env.OFFICIAL_APP_UA_PART));

      const qrCode = await qrCodeService.getQRCodeByToken(token);

      // If redirect is enabled and NOT from our app, redirect to external URL
      if (qrCode.isRedirectEnabled && qrCode.redirectUrl && !isApp) {
        return res.redirect(302, qrCode.redirectUrl);
      }

      // Otherwise redirect to the frontend calling page
      const frontendUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/call/${token}`;
      res.redirect(302, frontendUrl);
    }
  );
}

export const qrCodeController = new QRCodeController();
