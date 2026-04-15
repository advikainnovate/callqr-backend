import { Router } from 'express';
import { callController } from '../controllers/call.controller';
import {
  authenticateToken,
  authenticateTokenOrGuest,
} from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import {
  initiateCallSchema,
  initiateCallFromChatSchema,
  initiateCallbackCallSchema,
  updateCallStatusSchema,
  getCallSessionSchema,
  endCallSchema,
  acceptCallSchema,
  rejectCallSchema,
  getCallHistorySchema,
} from '../schemas/call.schema';

const router = Router();

// Initiate a call (allow guests)
router.post(
  '/initiate',
  authenticateTokenOrGuest,
  validate(initiateCallSchema),
  callController.initiateCall
);

router.post(
  '/from-chat',
  authenticateToken,
  validate(initiateCallFromChatSchema),
  callController.initiateCallFromChat
);

router.post(
  '/:callId/callback',
  authenticateToken,
  validate(initiateCallbackCallSchema),
  callController.initiateCallbackCall
);

// Get call session details (allow guests)
router.get(
  '/:callId',
  authenticateTokenOrGuest,
  validate(getCallSessionSchema),
  callController.getCallSession
);

// Update call status (allow guests)
router.patch(
  '/:callId/status',
  authenticateTokenOrGuest,
  validate(updateCallStatusSchema),
  callController.updateCallStatus
);

// End call (allow guests)
router.patch(
  '/:callId/end',
  authenticateTokenOrGuest,
  validate(endCallSchema),
  callController.endCall
);

// Accept call (allow guests)
router.patch(
  '/:callId/accept',
  authenticateTokenOrGuest,
  validate(acceptCallSchema),
  callController.acceptCall
);

// Reject call (allow guests)
router.patch(
  '/:callId/reject',
  authenticateTokenOrGuest,
  validate(rejectCallSchema),
  callController.rejectCall
);

// Get call history (registered user only)
router.get(
  '/history/all',
  authenticateToken,
  validate(getCallHistorySchema),
  callController.getCallHistory
);

// Get active calls (allow guests)
router.get(
  '/active/list',
  authenticateTokenOrGuest,
  callController.getActiveCalls
);

// Get call usage (registered user only)
router.get('/usage/stats', authenticateToken, callController.getCallUsage);

export default router;
