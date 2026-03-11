import { Router } from 'express';
import { messageController } from '../controllers/message.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate';
import { uploadMultipleImages, handleUploadError } from '../middlewares/upload.middleware';
import {
  sendMessageSchema,
  getMessagesSchema,
  markAsReadSchema,
  markChatAsReadSchema,
  deleteMessageSchema,
  searchMessagesSchema,
} from '../schemas/message.schema';

const router = Router();

// Send message (with optional media upload)
router.post(
  '/', 
  authenticateToken, 
  uploadMultipleImages,
  handleUploadError,
  validate(sendMessageSchema), 
  messageController.sendMessage
);

// Get unread count (MUST be before /:chatSessionId route)
router.get('/unread/count', authenticateToken, messageController.getUnreadCount);

// Get messages for a chat session
router.get('/:chatSessionId', authenticateToken, validate(getMessagesSchema), messageController.getMessages);

// Mark message as read
router.patch('/:messageId/read', authenticateToken, validate(markAsReadSchema), messageController.markAsRead);

// Mark all messages in chat as read
router.patch('/chat/:chatSessionId/read', authenticateToken, validate(markChatAsReadSchema), messageController.markChatAsRead);

// Delete message
router.delete('/:messageId', authenticateToken, validate(deleteMessageSchema), messageController.deleteMessage);

// Search messages (MUST be after /:chatSessionId route)
router.get('/:chatSessionId/search', authenticateToken, validate(searchMessagesSchema), messageController.searchMessages);

export default router;
