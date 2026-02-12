import { Router } from 'express';
import { chatSessionController } from '../controllers/chatSession.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import {
  initiateChatSchema,
  getChatSessionSchema,
  endChatSessionSchema,
  blockChatSessionSchema,
  getMyChatSessionsSchema,
} from '../schemas/chatSession.schema';

const router = Router();

// Initiate chat session
router.post('/initiate', authenticateToken, validate(initiateChatSchema), chatSessionController.initiateChat);

// Get chat session details
router.get('/:chatSessionId', authenticateToken, validate(getChatSessionSchema), chatSessionController.getChatSession);

// Get my chat sessions
router.get('/my/all', authenticateToken, validate(getMyChatSessionsSchema), chatSessionController.getMyChatSessions);

// Get active chat sessions
router.get('/active/list', authenticateToken, chatSessionController.getActiveChatSessions);

// End chat session
router.patch('/:chatSessionId/end', authenticateToken, validate(endChatSessionSchema), chatSessionController.endChatSession);

// Block chat session
router.patch('/:chatSessionId/block', authenticateToken, validate(blockChatSessionSchema), chatSessionController.blockChatSession);

export default router;
