import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { authenticateToken, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validation.middleware';
import { authLimiter } from '../middlewares/rateLimit.middleware';
import { registerUserSchema, loginUserSchema } from '../schemas/user.schema';
import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../utils';

const router = Router();

// Public routes with rate limiting and validation
router.post('/register',
  authLimiter,
  validateRequest(registerUserSchema),
  asyncHandler(userController.register)
);

router.post('/login',
  authLimiter,
  validateRequest(loginUserSchema),
  asyncHandler(userController.login)
);

// Protected routes
router.get('/profile',
  (req: Request, res: Response, next: NextFunction) =>
    authenticateToken(req as AuthenticatedRequest, res, next),
  asyncHandler(userController.getProfile)
);

router.patch('/profile',
  (req: Request, res: Response, next: NextFunction) =>
    authenticateToken(req as AuthenticatedRequest, res, next),
  asyncHandler(userController.updateProfile)
);

router.post('/change-password',
  (req: Request, res: Response, next: NextFunction) =>
    authenticateToken(req as AuthenticatedRequest, res, next),
  asyncHandler(userController.changePassword)
);

router.delete('/profile',
  (req: Request, res: Response, next: NextFunction) =>
    authenticateToken(req as AuthenticatedRequest, res, next),
  asyncHandler(userController.deleteAccount)
);

export default router;
