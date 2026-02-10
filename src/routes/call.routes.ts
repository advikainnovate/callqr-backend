import { Router } from 'express';
import { callController } from '../controllers/call.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import {
  initiateCallSchema,
  updateCallStatusSchema,
  getCallSessionSchema,
  endCallSchema,
  acceptCallSchema,
  rejectCallSchema,
  getCallHistorySchema,
} from '../schemas/call.schema';

const router = Router();

// Initiate a call
router.post('/initiate', authenticateToken, validate(initiateCallSchema), callController.initiateCall);

// Get call session details
router.get('/:callId', authenticateToken, validate(getCallSessionSchema), callController.getCallSession);

// Update call status
router.patch('/:callId/status', authenticateToken, validate(updateCallStatusSchema), callController.updateCallStatus);

// End call
router.patch('/:callId/end', authenticateToken, validate(endCallSchema), callController.endCall);

// Accept call
router.patch('/:callId/accept', authenticateToken, validate(acceptCallSchema), callController.acceptCall);

// Reject call
router.patch('/:callId/reject', authenticateToken, validate(rejectCallSchema), callController.rejectCall);

// Get call history
router.get('/history/all', authenticateToken, validate(getCallHistorySchema), callController.getCallHistory);

// Get active calls
router.get('/active/list', authenticateToken, callController.getActiveCalls);

// Get call usage
router.get('/usage/stats', authenticateToken, callController.getCallUsage);

export default router;
