import { Router } from 'express';
import { qrCodeController } from '../controllers/qrCode.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import {
  createQRCodeSchema,
  assignQRCodeSchema,
  scanQRCodeSchema,
  revokeQRCodeSchema,
  disableQRCodeSchema,
  reactivateQRCodeSchema,
  getQRCodeImageSchema,
} from '../schemas/qrCode.schema';

const router = Router();

// Create QR code
router.post('/create', authenticateToken, validate(createQRCodeSchema), qrCodeController.createQRCode);

// Assign QR code to user
router.post('/:qrCodeId/assign', authenticateToken, validate(assignQRCodeSchema), qrCodeController.assignQRCode);

// Scan QR code
router.post('/scan', validate(scanQRCodeSchema), qrCodeController.scanQRCode);

// Get my QR codes
router.get('/my-codes', authenticateToken, qrCodeController.getMyQRCodes);

// Get unassigned QR codes (admin only - you may want to add admin middleware)
router.get('/unassigned', authenticateToken, qrCodeController.getUnassignedQRCodes);

// Revoke QR code
router.patch('/:qrCodeId/revoke', authenticateToken, validate(revokeQRCodeSchema), qrCodeController.revokeQRCode);

// Disable QR code
router.patch('/:qrCodeId/disable', authenticateToken, validate(disableQRCodeSchema), qrCodeController.disableQRCode);

// Reactivate QR code
router.patch('/:qrCodeId/reactivate', authenticateToken, validate(reactivateQRCodeSchema), qrCodeController.reactivateQRCode);

// Get QR code image
router.get('/image/:token', validate(getQRCodeImageSchema), qrCodeController.getQRCodeImage);

export default router;
