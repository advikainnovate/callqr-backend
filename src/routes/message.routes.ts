import { Router } from 'express';
import { messageController } from '../controllers/message.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import {
  sendMessageSchema,
  getMessagesSchema,
  markAsReadSchema,
  markChatAsReadSchema,
  deleteMessageSchema,
  searchMessagesSchema,
} from '../schemas/message.schema';

const router = Router();

// Send message
router.post('/', authenticateToken, validate(sendMessageSchema), messageController.sendMessage);

// Get messages for a chat session
router.get('/:chatSessionId', authenticateToken, validate(getMessagesSchema), messageController.getMessages);

// Mark message as read
router.patch('/:messageId/read', authenticateToken, validate(markAsReadSchema), messageController.markAsRead);

// Mark all messages in chat as read
router.patch('/chat/:chatSessionId/read', authenticateToken, validate(markChatAsReadSchema), messageController.markChatAsRead);

// Delete message
router.delete('/:messageId', authenticateToken, validate(deleteMessageSchema), messageController.deleteMessage);

// Get unread count
router.get('/unread/count', authenticateToken, messageController.getUnreadCount);

// Search messages
router.get('/:chatSessionId/search', authenticateToken, validate(searchMessagesSchema), messageController.searchMessages);

export default router;
