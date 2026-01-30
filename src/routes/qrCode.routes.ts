import { Router } from 'express';
import { qrCodeController } from '../controllers/qrCode.controller';
import { authenticateToken, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { validateRequest, validateParams } from '../middlewares/validation.middleware';
import { qrScanLimiter, qrCreateLimiter } from '../middlewares/rateLimit.middleware';
import { scanQRCodeSchema, createQRCodeSchema } from '../schemas/qrCode.schema';
import { qrCodeIdSchema } from '../middlewares/validation.middleware';
import { Request, Response, NextFunction } from 'express';

const router = Router();

// Public routes with rate limiting and validation
router.post('/scan', 
  // qrScanLimiter, // Disabled for testing
  validateRequest(scanQRCodeSchema),
  qrCodeController.scanQRCode
);

router.get('/image/:token', qrCodeController.getQRCodeImage);

// Protected routes (temporarily disabled for testing)
router.post('/create', 
  (req: Request, res: Response, next: NextFunction) => 
    authenticateToken(req as AuthenticatedRequest, res, next),
  // qrCreateLimiter, // Disabled for testing
  validateRequest(createQRCodeSchema),
  qrCodeController.createQRCode
);

router.get('/my-codes', 
  (req: Request, res: Response, next: NextFunction) => 
    authenticateToken(req as AuthenticatedRequest, res, next),
  qrCodeController.getUserQRCodes
);

router.patch('/:qrCodeId/revoke', 
  (req: Request, res: Response, next: NextFunction) => 
    authenticateToken(req as AuthenticatedRequest, res, next),
  validateParams(qrCodeIdSchema),
  qrCodeController.revokeQRCode
);

export default router;
