import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { requireAdmin } from '../middlewares/admin.middleware';
import { validate } from '../middlewares/validate';
import { z } from 'zod';

const router = Router();

// Note: All admin routes require authentication AND admin role
// Admin middleware is applied to all routes below

// ==================== OVERVIEW ====================
router.get('/overview', authenticateToken, requireAdmin, adminController.getOverviewStats);

// ==================== USER MANAGEMENT ====================
router.get('/users', authenticateToken, requireAdmin, adminController.getAllUsers);
router.get('/users/:userId', authenticateToken, requireAdmin, adminController.getUserDetails);
router.patch('/users/:userId/block', authenticateToken, requireAdmin, adminController.blockUser);
router.patch('/users/:userId/unblock', authenticateToken, requireAdmin, adminController.unblockUser);
router.delete('/users/:userId', authenticateToken, requireAdmin, adminController.deleteUser);

// ==================== QR CODE MANAGEMENT ====================
router.get('/qr-codes', authenticateToken, requireAdmin, adminController.getAllQRCodes);
router.get('/qr-codes/:qrCodeId', authenticateToken, requireAdmin, adminController.getQRCodeDetails);
router.post(
  '/qr-codes/bulk-create',
  authenticateToken,
  requireAdmin,
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
  requireAdmin,
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
router.patch('/qr-codes/:qrCodeId/revoke', authenticateToken, requireAdmin, adminController.revokeQRCode);

// ==================== CALL HISTORY ====================
router.get('/calls', authenticateToken, requireAdmin, adminController.getCallHistory);
router.get('/calls/:callId', authenticateToken, requireAdmin, adminController.getCallDetails);

// ==================== CHAT HISTORY ====================
router.get('/chats', authenticateToken, requireAdmin, adminController.getChatHistory);
router.get('/chats/:chatId', authenticateToken, requireAdmin, adminController.getChatDetails);

// ==================== ANALYTICS & CHARTS ====================
router.get('/analytics/calls', authenticateToken, requireAdmin, adminController.getCallAnalytics);
router.get('/analytics/chats', authenticateToken, requireAdmin, adminController.getChatAnalytics);
router.get('/analytics/user-growth', authenticateToken, requireAdmin, adminController.getUserGrowthAnalytics);

// ==================== BUG REPORTS MANAGEMENT ====================
router.get('/bug-reports', authenticateToken, requireAdmin, adminController.getAllBugReports);
router.get('/bug-reports/stats', authenticateToken, requireAdmin, adminController.getBugReportStats);

// ==================== SUBSCRIPTION MANAGEMENT ====================
router.get('/subscriptions', authenticateToken, requireAdmin, adminController.getAllSubscriptions);
router.get('/subscriptions/stats', authenticateToken, requireAdmin, adminController.getSubscriptionStats);

// ==================== REAL-TIME MONITORING ====================
router.get('/monitoring/active-calls', authenticateToken, requireAdmin, adminController.getActiveCallsList);
router.get('/monitoring/active-chats', authenticateToken, requireAdmin, adminController.getActiveChatsList);
router.get('/monitoring/recent-activity', authenticateToken, requireAdmin, adminController.getRecentActivity);
router.get('/monitoring/system-health', authenticateToken, requireAdmin, adminController.getSystemHealth);

// ==================== REPORTS & EXPORT ====================
router.get('/export/users', authenticateToken, requireAdmin, adminController.exportUsers);
router.get('/export/qr-codes', authenticateToken, requireAdmin, adminController.exportQRCodes);
router.get('/export/call-history', authenticateToken, requireAdmin, adminController.exportCallHistory);
router.get('/export/chat-history', authenticateToken, requireAdmin, adminController.exportChatHistory);
router.get('/reports/user-growth', authenticateToken, requireAdmin, adminController.generateUserGrowthReport);

export default router;
