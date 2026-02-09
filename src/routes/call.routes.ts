import { Router } from 'express';
import { callController } from '../controllers/call.controller';
import { authenticateToken, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { validateRequest, validateParams } from '../middlewares/validation.middleware';
import { initiateCallSchema, updateCallStatusSchema, callIdSchema } from '../schemas/call.schema';
import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../utils';

const router = Router();

// All call routes are protected (temporarily disabled for testing)
router.post('/initiate',
  (req: Request, res: Response, next: NextFunction) =>
    authenticateToken(req as AuthenticatedRequest, res, next),
  validateRequest(initiateCallSchema),
  asyncHandler(callController.initiateCall)
);

router.get('/history',
  (req: Request, res: Response, next: NextFunction) =>
    authenticateToken(req as AuthenticatedRequest, res, next),
  asyncHandler(callController.getCallHistory)
);

router.get('/usage',
  (req: Request, res: Response, next: NextFunction) =>
    authenticateToken(req as AuthenticatedRequest, res, next),
  asyncHandler(callController.getCallUsage)
);

router.get('/active',
  (req: Request, res: Response, next: NextFunction) =>
    authenticateToken(req as AuthenticatedRequest, res, next),
  asyncHandler(callController.getActiveCalls)
);

router.get('/:callId',
  (req: Request, res: Response, next: NextFunction) =>
    authenticateToken(req as AuthenticatedRequest, res, next),
  validateParams(callIdSchema),
  asyncHandler(callController.getCallDetails)
);

router.patch('/:callId/status',
  (req: Request, res: Response, next: NextFunction) =>
    authenticateToken(req as AuthenticatedRequest, res, next),
  validateParams(callIdSchema),
  validateRequest(updateCallStatusSchema),
  asyncHandler(callController.updateCallStatus)
);

router.patch('/:callId/end',
  (req: Request, res: Response, next: NextFunction) =>
    authenticateToken(req as AuthenticatedRequest, res, next),
  validateParams(callIdSchema),
  asyncHandler(callController.endCall)
);

export default router;
