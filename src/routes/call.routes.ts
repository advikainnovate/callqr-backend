import { Router } from 'express';
import { callController } from '../controllers/call.controller';
import { authenticateToken, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { validateRequest, validateParams } from '../middlewares/validation.middleware';
import { initiateCallSchema, updateCallStatusSchema, callIdSchema } from '../schemas/call.schema';
import { Request, Response, NextFunction } from 'express';

const router = Router();

// All call routes are protected (temporarily disabled for testing)
router.post('/initiate',
  (req: Request, res: Response, next: NextFunction) =>
    authenticateToken(req as AuthenticatedRequest, res, next),
  validateRequest(initiateCallSchema),
  callController.initiateCall
);

router.get('/history',
  (req: Request, res: Response, next: NextFunction) =>
    authenticateToken(req as AuthenticatedRequest, res, next),
  callController.getCallHistory
);

router.get('/usage',
  (req: Request, res: Response, next: NextFunction) =>
    authenticateToken(req as AuthenticatedRequest, res, next),
  callController.getCallUsage
);

router.get('/active',
  (req: Request, res: Response, next: NextFunction) =>
    authenticateToken(req as AuthenticatedRequest, res, next),
  callController.getActiveCalls
);

router.get('/:callId',
  (req: Request, res: Response, next: NextFunction) =>
    authenticateToken(req as AuthenticatedRequest, res, next),
  validateParams(callIdSchema),
  callController.getCallDetails
);

router.patch('/:callId/status',
  (req: Request, res: Response, next: NextFunction) =>
    authenticateToken(req as AuthenticatedRequest, res, next),
  validateParams(callIdSchema),
  validateRequest(updateCallStatusSchema),
  callController.updateCallStatus
);

router.patch('/:callId/end',
  (req: Request, res: Response, next: NextFunction) =>
    authenticateToken(req as AuthenticatedRequest, res, next),
  validateParams(callIdSchema),
  callController.endCall
);

export default router;
