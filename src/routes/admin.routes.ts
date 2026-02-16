import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import { z } from 'zod';

const router = Router();

// Note: All admin routes require authentication
// TODO: Add admin role middleware to restrict access

// ==================== OVERVIEW ====================
router.get('/overview', authenticateToken, adminController.getOverviewStats);

// ==================== USER MANAGEMENT ====================
router.get('/users', authenticateToken, adminController.getAllUsers);
router.get('/users/:userId', authenticateToken, adminController.getUserDetails);
router.patch('/users/:userId/block', authenticateToken, adminController.blockUser);
router.patch('/users/:userId/unblock', authenticateToken, adminController.unblockUser);
router.delete('/users/:userId', authenticateToken, adminController.deleteUser);

// ==================== QR CODE MANAGEMENT ====================
router.get('/qr-codes', authenticateToken, adminController.getAllQRCodes);
router.get('/qr-codes/:qrCodeId', authenticateToken, adminController.getQRCodeDetails);
router.post(
  '/qr-codes/bulk-create',
  authenticateToken,
  validate(
    z.object({
      body: z.object({
        count: z.number().int().min(1).max(1000),
      }),
    })
  ),
  adminController.bulkCreateQRCodes
);
router.post(
  '/qr-codes/:qrCodeId/assign',
  authenticateToken,
  validate(
    z.object({
      body: z.object({
        userId: z.string().uuid(),
      }),
      params: z.object({
        qrCodeId: z.string().uuid(),
      }),
    })
  ),
  adminController.assignQRCode
);
router.patch('/qr-codes/:qrCodeId/revoke', authenticateToken, adminController.revokeQRCode);

// ==================== CALL HISTORY ====================
router.get('/calls', authenticateToken, adminController.getCallHistory);
router.get('/calls/:callId', authenticateToken, adminController.getCallDetails);

// ==================== CHAT HISTORY ====================
router.get('/chats', authenticateToken, adminController.getChatHistory);
router.get('/chats/:chatId', authenticateToken, adminController.getChatDetails);

export default router;
