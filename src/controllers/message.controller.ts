import { Response } from 'express';
import { messageService } from '../services/message.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { asyncHandler } from '../utils';
import { sendSuccessResponse } from '../utils/responseHandler';

export class MessageController {
  sendMessage = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const senderId = req.user!.userId;
    const { chatSessionId, content, messageType } = req.body;
    
    // Get uploaded files if any
    const mediaFiles = req.files as Express.Multer.File[] | undefined;

    const message = await messageService.sendMessage(
      chatSessionId, 
      senderId, 
      content, 
      messageType,
      mediaFiles
    );

    sendSuccessResponse(res, 201, 'Message sent successfully', {
      id: message.id,
      chatSessionId: message.chatSessionId,
      senderId: message.senderId,
      messageType: message.messageType,
      content: message.content,
      mediaAttachments: message.mediaAttachments,
      isRead: message.isRead,
      sentAt: message.sentAt,
    });
  });

  getMessages = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { chatSessionId } = req.params;
    const userId = req.user!.userId;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

    const messages = await messageService.getMessages(chatSessionId, userId, limit, offset);

    sendSuccessResponse(res, 200, 'Messages retrieved successfully', {
      messages: messages.map((msg) => ({
        id: msg.id,
        chatSessionId: msg.chatSessionId,
        senderId: msg.senderId,
        messageType: msg.messageType,
        content: msg.content,
        mediaAttachments: msg.mediaAttachments,
        isRead: msg.isRead,
        sentAt: msg.sentAt,
        readAt: msg.readAt,
      })),
      pagination: {
        limit,
        offset,
        count: messages.length,
      },
    });
  });

  markAsRead = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { messageId } = req.params;
    const userId = req.user!.userId;

    const message = await messageService.markAsRead(messageId, userId);

    sendSuccessResponse(res, 200, 'Message marked as read', {
      id: message.id,
      isRead: message.isRead,
      readAt: message.readAt,
    });
  });

  markChatAsRead = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { chatSessionId } = req.params;
    const userId = req.user!.userId;

    const count = await messageService.markChatMessagesAsRead(chatSessionId, userId);

    sendSuccessResponse(res, 200, `${count} messages marked as read`, {
      count,
    });
  });

  deleteMessage = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { messageId } = req.params;
    const userId = req.user!.userId;

    const message = await messageService.deleteMessage(messageId, userId);

    sendSuccessResponse(res, 200, 'Message deleted successfully', {
      id: message.id,
      isDeleted: message.isDeleted,
    });
  });

  getUnreadCount = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const unreadCount = await messageService.getUnreadCount(userId);

    sendSuccessResponse(res, 200, 'Unread count retrieved successfully', {
      unreadCount,
    });
  });

  searchMessages = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { chatSessionId } = req.params;
    const userId = req.user!.userId;
    const { query } = req.query;

    if (!query || typeof query !== 'string') {
      return sendSuccessResponse(res, 400, 'Search query is required', null);
    }

    const messages = await messageService.searchMessages(chatSessionId, userId, query);

    sendSuccessResponse(res, 200, 'Search results retrieved successfully', {
      messages: messages.map((msg) => ({
        id: msg.id,
        chatSessionId: msg.chatSessionId,
        senderId: msg.senderId,
        messageType: msg.messageType,
        content: msg.content,
        mediaAttachments: msg.mediaAttachments,
        isRead: msg.isRead,
        sentAt: msg.sentAt,
        readAt: msg.readAt,
      })),
      query,
      count: messages.length,
    });
  });
}

export const messageController = new MessageController();
