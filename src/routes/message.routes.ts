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
  markAsDeliveredSchema,
  markChatAsDeliveredSchema,
  getDeliveryStatusSchema,
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

// Mark message as delivered
router.patch('/:messageId/delivered', authenticateToken, validate(markAsDeliveredSchema), messageController.markAsDelivered);

// Mark all messages in chat as read
router.patch('/chat/:chatSessionId/read', authenticateToken, validate(markChatAsReadSchema), messageController.markChatAsRead);

// Mark all messages in chat as delivered
router.patch('/chat/:chatSessionId/delivered', authenticateToken, validate(markChatAsDeliveredSchema), messageController.markChatAsDelivered);

// Get message delivery status
router.get('/:messageId/status', authenticateToken, validate(getDeliveryStatusSchema), messageController.getDeliveryStatus);

// Delete message
router.delete('/:messageId', authenticateToken, validate(deleteMessageSchema), messageController.deleteMessage);

// Search messages (MUST be after /:chatSessionId route)
router.get('/:chatSessionId/search', authenticateToken, validate(searchMessagesSchema), messageController.searchMessages);

export default router;
