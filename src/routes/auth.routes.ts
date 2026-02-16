import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import { z } from 'zod';

const router = Router();

// Registration schema
const registerSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(50),
    password: z.string().min(6).max(100),
    phone: z.string().optional(),
    email: z.string().email().optional(),
  }),
});

// Login schema
const loginSchema = z.object({
  body: z.object({
    username: z.string(),
    password: z.string(),
  }),
});

// Change password schema
const changePasswordSchema = z.object({
  body: z.object({
    oldPassword: z.string(),
    newPassword: z.string().min(6).max(100),
  }),
});

// Public routes
router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);

// Protected routes
router.get('/profile', authenticateToken, authController.getProfile);
router.post('/change-password', authenticateToken, validate(changePasswordSchema), authController.changePassword);

export default router;
