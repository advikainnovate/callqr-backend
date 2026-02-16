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
        count: z.number().int().min(1).max(2000),
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

// ==================== ANALYTICS & CHARTS ====================
router.get('/analytics/calls', authenticateToken, adminController.getCallAnalytics);
router.get('/analytics/chats', authenticateToken, adminController.getChatAnalytics);
router.get('/analytics/user-growth', authenticateToken, adminController.getUserGrowthAnalytics);

// ==================== BUG REPORTS MANAGEMENT ====================
router.get('/bug-reports', authenticateToken, adminController.getAllBugReports);
router.get('/bug-reports/stats', authenticateToken, adminController.getBugReportStats);

// ==================== SUBSCRIPTION MANAGEMENT ====================
router.get('/subscriptions', authenticateToken, adminController.getAllSubscriptions);
router.get('/subscriptions/stats', authenticateToken, adminController.getSubscriptionStats);

// ==================== REAL-TIME MONITORING ====================
router.get('/monitoring/active-calls', authenticateToken, adminController.getActiveCallsList);
router.get('/monitoring/active-chats', authenticateToken, adminController.getActiveChatsList);
router.get('/monitoring/recent-activity', authenticateToken, adminController.getRecentActivity);
router.get('/monitoring/system-health', authenticateToken, adminController.getSystemHealth);

// ==================== REPORTS & EXPORT ====================
router.get('/export/users', authenticateToken, adminController.exportUsers);
router.get('/export/qr-codes', authenticateToken, adminController.exportQRCodes);
router.get('/export/call-history', authenticateToken, adminController.exportCallHistory);
router.get('/export/chat-history', authenticateToken, adminController.exportChatHistory);
router.get('/reports/user-growth', authenticateToken, adminController.generateUserGrowthReport);

export default router;
