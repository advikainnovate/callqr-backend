import { Response } from 'express';
import { chatSessionService } from '../services/chatSession.service';
import { messageService } from '../services/message.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { asyncHandler, UnauthorizedError } from '../utils';
import { sendSuccessResponse } from '../utils/responseHandler';

export class ChatSessionController {
  initiateChat = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const initiatorId = identity.userId;
      const { qrToken } = req.body;

      const chatSession = await chatSessionService.initiateChat(
        initiatorId,
        qrToken
      );

      sendSuccessResponse(res, 201, 'Chat session initiated successfully', {
        id: chatSession.id,
        participant1Id: chatSession.participant1Id,
        participant2Id: chatSession.participant2Id,
        participant1Name: chatSession.participant1Name,
        participant2Name: chatSession.participant2Name,
        status: chatSession.status,
        startedAt: chatSession.startedAt,
      });
    }
  );

  getChatSession = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { chatSessionId } = req.params;
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;

      const chatSession =
        await chatSessionService.getChatSessionById(chatSessionId);

      // Verify user is participant
      const isParticipant = await chatSessionService.verifyParticipant(
        chatSessionId,
        userId
      );
      if (!isParticipant) {
        return sendSuccessResponse(
          res,
          403,
          'You are not a participant in this chat',
          null
        );
      }

      // Get last message
      const lastMessage = await messageService.getLastMessage(chatSessionId);

      // Get unread count
      const unreadCount = await messageService.getUnreadCountByChat(
        chatSessionId,
        userId
      );

      sendSuccessResponse(res, 200, 'Chat session retrieved successfully', {
        id: chatSession.id,
        participant1Id: chatSession.participant1Id,
        participant2Id: chatSession.participant2Id,
        participant1Name: chatSession.participant1Name,
        participant2Name: chatSession.participant2Name,
        qrId: chatSession.qrId,
        status: chatSession.status,
        startedAt: chatSession.startedAt,
        endedAt: chatSession.endedAt,
        lastMessageAt: chatSession.lastMessageAt,
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              senderId: lastMessage.senderId,
              senderName: lastMessage.senderName,
              content: lastMessage.content,
              messageType: lastMessage.messageType,
              sentAt: lastMessage.sentAt,
            }
          : null,
        unreadCount,
      });
    }
  );

  getMyChatSessions = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      const chatSessions = await chatSessionService.getUserChatSessions(
        userId,
        limit
      );

      // Get last message and unread count for each chat
      const chatsWithDetails = await Promise.all(
        chatSessions.map(async chat => {
          const lastMessage = await messageService.getLastMessage(chat.id);
          const unreadCount = await messageService.getUnreadCountByChat(
            chat.id,
            userId
          );

          return {
            id: chat.id,
            participant1Id: chat.participant1Id,
            participant2Id: chat.participant2Id,
            participant1Name: chat.participant1Name,
            participant2Name: chat.participant2Name,
            status: chat.status,
            startedAt: chat.startedAt,
            endedAt: chat.endedAt,
            lastMessageAt: chat.lastMessageAt,
            lastMessage: lastMessage
              ? {
                  id: lastMessage.id,
                  senderId: lastMessage.senderId,
                  senderName: lastMessage.senderName,
                  content: lastMessage.content,
                  messageType: lastMessage.messageType,
                  sentAt: lastMessage.sentAt,
                }
              : null,
            unreadCount,
          };
        })
      );

      sendSuccessResponse(res, 200, 'Chat sessions retrieved successfully', {
        chats: chatsWithDetails,
      });
    }
  );

  getActiveChatSessions = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;
      const chatSessions =
        await chatSessionService.getActiveChatSessions(userId);

      // Get last message and unread count for each chat
      const chatsWithDetails = await Promise.all(
        chatSessions.map(async chat => {
          const lastMessage = await messageService.getLastMessage(chat.id);
          const unreadCount = await messageService.getUnreadCountByChat(
            chat.id,
            userId
          );

          return {
            id: chat.id,
            participant1Id: chat.participant1Id,
            participant2Id: chat.participant2Id,
            participant1Name: chat.participant1Name,
            participant2Name: chat.participant2Name,
            status: chat.status,
            startedAt: chat.startedAt,
            lastMessageAt: chat.lastMessageAt,
            lastMessage: lastMessage
              ? {
                  id: lastMessage.id,
                  senderId: lastMessage.senderId,
                  senderName: lastMessage.senderName,
                  content: lastMessage.content,
                  messageType: lastMessage.messageType,
                  sentAt: lastMessage.sentAt,
                }
              : null,
            unreadCount,
          };
        })
      );

      sendSuccessResponse(
        res,
        200,
        'Active chat sessions retrieved successfully',
        {
          chats: chatsWithDetails,
        }
      );
    }
  );

  endChatSession = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { chatSessionId } = req.params;
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;

      const chatSession = await chatSessionService.endChatSession(
        chatSessionId,
        userId
      );

      sendSuccessResponse(res, 200, 'Chat session ended successfully', {
        id: chatSession.id,
        status: chatSession.status,
        endedAt: chatSession.endedAt,
      });
    }
  );

  blockChatSession = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { chatSessionId } = req.params;
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }
      const userId = identity.userId;

      const chatSession = await chatSessionService.blockChatSession(
        chatSessionId,
        userId
      );

      sendSuccessResponse(res, 200, 'Chat session blocked successfully', {
        id: chatSession.id,
        status: chatSession.status,
        endedAt: chatSession.endedAt,
      });
    }
  );
}

export const chatSessionController = new ChatSessionController();
