import { Router } from 'express';
import { qrCodeController } from '../controllers/qrCode.controller';
import { authenticateToken, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { validateRequest, validateParams } from '../middlewares/validation.middleware';
import { scanQRCodeSchema, createQRCodeSchema, qrCodeIdSchema } from '../schemas/qrCode.schema';
import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../utils';

const router = Router();

// Public routes with rate limiting and validation
router.post('/scan',
  // qrScanLimiter, // Disabled for testing
  validateRequest(scanQRCodeSchema),
  asyncHandler(qrCodeController.scanQRCode)
);

router.get('/image/:token', asyncHandler(qrCodeController.getQRCodeImage));

// Protected routes (temporarily disabled for testing)
router.post('/create',
  (req: Request, res: Response, next: NextFunction) =>
    authenticateToken(req as AuthenticatedRequest, res, next),
  // qrCreateLimiter, // Disabled for testing
  validateRequest(createQRCodeSchema),
  asyncHandler(qrCodeController.createQRCode)
);

router.get('/my-codes',
  (req: Request, res: Response, next: NextFunction) =>
    authenticateToken(req as AuthenticatedRequest, res, next),
  asyncHandler(qrCodeController.getUserQRCodes)
);

router.patch('/:qrCodeId/revoke',
  (req: Request, res: Response, next: NextFunction) =>
    authenticateToken(req as AuthenticatedRequest, res, next),
  validateParams(qrCodeIdSchema),
  asyncHandler(qrCodeController.revokeQRCode)
);

export default router;
