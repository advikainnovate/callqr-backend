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
  removeDeviceTokenSchema,
} from '../schemas/user.schema';
import {
  blockUserSchema,
  unblockUserSchema,
  getBlockedUsersSchema,
} from '../schemas/userBlock.schema';

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

// Delete user (soft delete - admin only)
router.delete(
  '/:userId',
  authenticateToken,
  requireAdmin,
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
  validate(verifyPhoneSchema),
  userController.verifyPhone
);

// Verify email
router.post(
  '/verify/email',
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

// ==================== DEVICE TOKEN ROUTES ====================

// Register or update a device token
router.post(
  '/device-tokens',
  authenticateToken,
  validate(upsertDeviceTokenSchema),
  userController.upsertDeviceToken
);

// Remove a device token
router.delete(
  '/device-tokens/:token',
  authenticateToken,
  validate(removeDeviceTokenSchema),
  userController.removeDeviceToken
);

export default router;
