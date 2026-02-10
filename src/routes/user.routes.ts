import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import {
  createUserSchema,
  updateUserSchema,
  getUserSchema,
  verifyPhoneSchema,
  verifyEmailSchema,
} from '../schemas/user.schema';

const router = Router();

// Create user (register)
router.post('/register', validate(createUserSchema), userController.createUser);

// Get current user profile
router.get('/profile', authenticateToken, userController.getProfile);

// Get user by ID
router.get('/:userId', authenticateToken, validate(getUserSchema), userController.getUser);

// Update user
router.patch('/:userId', authenticateToken, validate(updateUserSchema), userController.updateUser);

// Block user (admin only - you may want to add admin middleware)
router.patch('/:userId/block', authenticateToken, validate(getUserSchema), userController.blockUser);

// Delete user (soft delete)
router.delete('/:userId', authenticateToken, validate(getUserSchema), userController.deleteUser);

// Activate user
router.patch('/:userId/activate', authenticateToken, validate(getUserSchema), userController.activateUser);

// Verify phone
router.post('/verify/phone', validate(verifyPhoneSchema), userController.verifyPhone);

// Verify email
router.post('/verify/email', validate(verifyEmailSchema), userController.verifyEmail);

export default router;
