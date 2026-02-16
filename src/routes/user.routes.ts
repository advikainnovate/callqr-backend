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
} from '../schemas/user.schema';

const router = Router();

// Get user by ID
router.get('/:userId', authenticateToken, validate(getUserSchema), userController.getUser);

// Update user
router.patch('/:userId', authenticateToken, validate(updateUserSchema), userController.updateUser);

// Block user (admin only)
router.patch('/:userId/block', authenticateToken, requireAdmin, validate(getUserSchema), userController.blockUser);

// Delete user (soft delete - admin only)
router.delete('/:userId', authenticateToken, requireAdmin, validate(getUserSchema), userController.deleteUser);

// Activate user (admin only)
router.patch('/:userId/activate', authenticateToken, requireAdmin, validate(getUserSchema), userController.activateUser);

// Verify phone
router.post('/verify/phone', validate(verifyPhoneSchema), userController.verifyPhone);

// Verify email
router.post('/verify/email', validate(verifyEmailSchema), userController.verifyEmail);

export default router;
