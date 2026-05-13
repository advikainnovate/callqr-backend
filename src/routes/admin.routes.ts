import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { requireAdmin } from '../middlewares/admin.middleware';
import { validate } from '../middlewares/validate';
import { z } from 'zod';

const router = Router();

// Note: All admin routes require authentication and admin role

// ==================== OVERVIEW ====================
router.get(
  '/overview',
  authenticateToken,
  requireAdmin,
  adminController.getOverviewStats
);

// ==================== USER MANAGEMENT ====================

/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: Get all users with filtering and pagination
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, blocked, deleted, pending_verification]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 */
router.get(
  '/users',
  authenticateToken,
  requireAdmin,
  adminController.getAllUsers
);

/**
 * @swagger
 * /admin/users/{userId}:
 *   get:
 *     summary: Get detailed information about a specific user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User details retrieved successfully
 */
router.get(
  '/users/:userId',
  authenticateToken,
  requireAdmin,
  adminController.getUserDetails
);

/**
 * @swagger
 * /admin/users/{userId}/block:
 *   patch:
 *     summary: Block a user account
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User blocked successfully
 */
router.patch(
  '/users/:userId/block',
  authenticateToken,
  requireAdmin,
  adminController.blockUser
);

/**
 * @swagger
 * /admin/users/{userId}/unblock:
 *   patch:
 *     summary: Unblock a user account
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User unblocked successfully
 */
router.patch(
  '/users/:userId/unblock',
  authenticateToken,
  requireAdmin,
  adminController.unblockUser
);

/**
 * @swagger
 * /admin/users/{userId}:
 *   delete:
 *     summary: Soft delete a user account (initiates 7-day grace period)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User soft-deleted successfully
 */
router.delete(
  '/users/:userId',
  authenticateToken,
  requireAdmin,
  adminController.deleteUser
);

/**
 * @swagger
 * /admin/users/{userId}/restore:
 *   patch:
 *     summary: Restore a soft-deleted user account (within 7-day grace period)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User account restored successfully
 */
router.patch(
  '/users/:userId/restore',
  authenticateToken,
  requireAdmin,
  adminController.restoreUser
);

// Global User Blocking
router.post(
  '/users/:userId/global-block',
  authenticateToken,
  requireAdmin,
  validate(
    z.object({
      body: z.object({
        reason: z.string().min(1).max(500),
      }),
      params: z.object({
        userId: z.string().uuid(),
      }),
    })
  ),
  adminController.globalBlockUser
);
router.post(
  '/users/:userId/global-unblock',
  authenticateToken,
  requireAdmin,
  adminController.globalUnblockUser
);
router.get(
  '/users/global-blocked/list',
  authenticateToken,
  requireAdmin,
  adminController.getGloballyBlockedUsers
);

// ==================== QR CODE MANAGEMENT ====================
router.get(
  '/qr-codes',
  authenticateToken,
  requireAdmin,
  adminController.getAllQRCodes
);
router.get(
  '/qr-codes/:qrCodeId',
  authenticateToken,
  requireAdmin,
  adminController.getQRCodeDetails
);
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
router.patch(
  '/qr-codes/:qrCodeId/revoke',
  authenticateToken,
  requireAdmin,
  adminController.revokeQRCode
);

// ==================== CALL HISTORY ====================
router.get(
  '/calls',
  authenticateToken,
  requireAdmin,
  adminController.getCallHistory
);
router.get(
  '/calls/:callId',
  authenticateToken,
  requireAdmin,
  adminController.getCallDetails
);

// ==================== CHAT HISTORY ====================
router.get(
  '/chats',
  authenticateToken,
  requireAdmin,
  adminController.getChatHistory
);
router.get(
  '/chats/:chatId',
  authenticateToken,
  requireAdmin,
  adminController.getChatDetails
);

// ==================== ANALYTICS & CHARTS ====================
router.get(
  '/analytics/calls',
  authenticateToken,
  requireAdmin,
  adminController.getCallAnalytics
);
router.get(
  '/analytics/chats',
  authenticateToken,
  requireAdmin,
  adminController.getChatAnalytics
);
router.get(
  '/analytics/user-growth',
  authenticateToken,
  requireAdmin,
  adminController.getUserGrowthAnalytics
);

// ==================== BUG REPORTS MANAGEMENT ====================
router.get(
  '/bug-reports',
  authenticateToken,
  requireAdmin,
  adminController.getAllBugReports
);
router.get(
  '/bug-reports/stats',
  authenticateToken,
  requireAdmin,
  adminController.getBugReportStats
);

// ==================== SUBSCRIPTION MANAGEMENT ====================
router.get(
  '/subscriptions',
  authenticateToken,
  requireAdmin,
  adminController.getAllSubscriptions
);
router.get(
  '/subscriptions/stats',
  authenticateToken,
  requireAdmin,
  adminController.getSubscriptionStats
);

// ==================== REAL-TIME MONITORING ====================
router.get(
  '/monitoring/active-calls',
  authenticateToken,
  requireAdmin,
  adminController.getActiveCallsList
);
router.get(
  '/monitoring/active-chats',
  authenticateToken,
  requireAdmin,
  adminController.getActiveChatsList
);
router.get(
  '/monitoring/recent-activity',
  authenticateToken,
  requireAdmin,
  adminController.getRecentActivity
);
router.get(
  '/monitoring/system-health',
  authenticateToken,
  requireAdmin,
  adminController.getSystemHealth
);

// ==================== REPORTS & EXPORT ====================
router.get(
  '/export/users',
  authenticateToken,
  requireAdmin,
  adminController.exportUsers
);
router.get(
  '/export/qr-codes',
  authenticateToken,
  requireAdmin,
  adminController.exportQRCodes
);
router.get(
  '/export/qr-codes/unassigned-zip',
  authenticateToken,
  requireAdmin,
  adminController.exportUnassignedQRCodesZip
);
router.get(
  '/export/call-history',
  authenticateToken,
  requireAdmin,
  adminController.exportCallHistory
);
router.get(
  '/export/chat-history',
  authenticateToken,
  requireAdmin,
  adminController.exportChatHistory
);
router.get(
  '/reports/user-growth',
  authenticateToken,
  requireAdmin,
  adminController.generateUserGrowthReport
);

export default router;
