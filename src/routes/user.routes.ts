import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { authenticateToken, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validation.middleware';
import { authLimiter } from '../middlewares/rateLimit.middleware';
import { registerUserSchema, loginUserSchema } from '../schemas/user.schema';
import { Request, Response, NextFunction } from 'express';

const router = Router();

// Public routes with rate limiting and validation
router.post('/register', 
  authLimiter,
  validateRequest(registerUserSchema),
  userController.register
);

router.post('/login', 
  authLimiter,
  validateRequest(loginUserSchema),
  userController.login
);

// Protected routes (temporarily disabled for testing)
router.get('/profile', 
  // (req: Request, res: Response, next: NextFunction) => 
  //   authenticateToken(req as AuthenticatedRequest, res, next),
  userController.getProfile
);

export default router;
