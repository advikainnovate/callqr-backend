import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { requireAdmin } from '../middlewares/admin.middleware';
import { validate } from '../middlewares/validate';
import {
  createUserSchema,
  updateUserSchema,
  getUserSchema,
  verifyPhoneSchema,
  verifyEmailSchema,
  upsertDeviceTokenSchema,
  removePushTokenSchema,
} from '../schemas/user.schema';
import {
  blockUserSchema,
  unblockUserSchema,
  getBlockedUsersSchema,
} from '../schemas/userBlock.schema';
import { authLimiter } from '../middlewares/rateLimit.middleware';

const router = Router();

// Get user by ID
router.get(
  '/:userId',
  authenticateToken,
  validate(getUserSchema),
  userController.getUser
);

// Update user
router.patch(
  '/:userId',
  authenticateToken,
  validate(updateUserSchema),
  userController.updateUser
);

// Block user (admin only)
router.patch(
  '/:userId/block',
  authenticateToken,
  requireAdmin,
  validate(getUserSchema),
  userController.blockUser
);

/**
 * @swagger
 * /users/me:
 *   delete:
 *     summary: Delete your own account
 *     description: Initiates soft-deletion with a 7-day grace period.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account deactivated successfully
 */
router.delete('/me', authenticateToken, userController.deleteSelf);

// Delete user (soft delete - self or admin only)
router.delete(
  '/:userId',
  authenticateToken,
  validate(getUserSchema),
  userController.deleteUser
);

// Activate user (admin only)
router.patch(
  '/:userId/activate',
  authenticateToken,
  requireAdmin,
  validate(getUserSchema),
  userController.activateUser
);

// Verify phone
router.post(
  '/verify/phone',
  authLimiter,
  validate(verifyPhoneSchema),
  userController.verifyPhone
);

// Verify email
router.post(
  '/verify/email',
  authLimiter,
  validate(verifyEmailSchema),
  userController.verifyEmail
);

// ==================== USER BLOCKING ROUTES ====================

// Block a user (user-to-user blocking)
router.post(
  '/:userId/user-block',
  authenticateToken,
  validate(blockUserSchema),
  userController.blockUserById
);

// Unblock a user
router.delete(
  '/:userId/user-unblock',
  authenticateToken,
  validate(unblockUserSchema),
  userController.unblockUserById
);

// Get list of blocked users
router.get(
  '/blocked/list',
  authenticateToken,
  validate(getBlockedUsersSchema),
  userController.getBlockedUsers
);

// ==================== PUSH TOKEN ROUTES ====================

router.post(
  '/push-token',
  authenticateToken,
  validate(upsertDeviceTokenSchema),
  userController.upsertPushToken
);

router.delete(
  '/push-token',
  authenticateToken,
  validate(removePushTokenSchema),
  userController.removePushToken
);

export default router;
