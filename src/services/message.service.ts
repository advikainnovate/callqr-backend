import { eq, and, desc, sql, gte, like, inArray } from 'drizzle-orm';
import { db } from '../db';
import { messages, type NewMessage, type Message, type MessageMedia } from '../models';
import { v4 as uuidv4 } from 'uuid';
import { logger, NotFoundError, BadRequestError, ForbiddenError, TooManyRequestsError } from '../utils';
import { chatSessionService } from './chatSession.service';
import { subscriptionService } from './subscription.service';
import { mediaService } from './media.service';
import { DAILY_MESSAGE_LIMITS } from '../constants/subscriptions';

export class MessageService {
  async sendMessage(
    chatSessionId: string,
    senderId: string,
    content: string,
    messageType: 'text' | 'image' | 'file' | 'system' = 'text',
    mediaFiles?: Express.Multer.File[]
  ): Promise<Message> {
    // Validate input parameters
    if (!chatSessionId || !senderId) {
      throw new BadRequestError('Chat session ID and sender ID are required');
    }

    // Verify sender is participant in chat
    const isParticipant = await chatSessionService.verifyParticipant(chatSessionId, senderId);
    if (!isParticipant) {
      throw new ForbiddenError('You are not a participant in this chat');
    }

    // Get chat session and verify it's active
    const chatSession = await chatSessionService.getChatSessionById(chatSessionId);
    if (chatSession.status !== 'active') {
      throw new BadRequestError(`Cannot send message to ${chatSession.status} chat`);
    }

    // Check daily message limit
    await this.checkDailyMessageLimit(senderId);

    // Validate content based on message type
    if (messageType === 'text') {
      if (!content || content.trim().length === 0) {
        throw new BadRequestError('Message content cannot be empty');
      }
      if (content.length > 5000) {
        throw new BadRequestError('Message content exceeds maximum length of 5000 characters');
      }
    }

    // Handle media uploads for image messages
    let mediaAttachments: MessageMedia[] | undefined;
    if (messageType === 'image' && mediaFiles && mediaFiles.length > 0) {
      try {
        const uploadResults = await mediaService.uploadImages(mediaFiles, senderId);
        mediaAttachments = uploadResults.map(result => ({
          ...result,
          thumbnailUrl: mediaService.generateImageUrls(result.publicId).thumbnail,
        }));
        
        // For image messages, content can be optional (caption)
        if (!content) {
          content = `Sent ${mediaAttachments.length} image${mediaAttachments.length > 1 ? 's' : ''}`;
        }
      } catch (error) {
        logger.error('Failed to upload media files:', error);
        throw error;
      }
    }

    // Create message
    const [message] = await db
      .insert(messages)
      .values({
        id: uuidv4(),
        chatSessionId,
        senderId,
        messageType,
        content: content.trim(),
        mediaAttachments,
        isRead: false,
        isDeleted: false,
        sentAt: new Date(),
      })
      .returning();

    // Update chat session's last message time
    await chatSessionService.updateLastMessageTime(chatSessionId);

    logger.info(`Message sent: ${message.id} in chat ${chatSessionId} (type: ${messageType})`);
    return message;
  }

  async getMessages(
    chatSessionId: string,
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Message[]> {
    // Verify user is participant in chat
    const isParticipant = await chatSessionService.verifyParticipant(chatSessionId, userId);
    if (!isParticipant) {
      throw new ForbiddenError('You are not a participant in this chat');
    }

    return db
      .select()
      .from(messages)
      .where(and(eq(messages.chatSessionId, chatSessionId), eq(messages.isDeleted, false)))
      .orderBy(desc(messages.sentAt))
      .limit(limit)
      .offset(offset);
  }

  async markAsRead(messageId: string, userId: string): Promise<Message> {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    // Verify user is participant in chat
    const isParticipant = await chatSessionService.verifyParticipant(message.chatSessionId, userId);
    if (!isParticipant) {
      throw new ForbiddenError('You are not a participant in this chat');
    }

    // Only mark as read if user is not the sender
    if (message.senderId === userId) {
      return message;
    }

    // Only update if not already read
    if (message.isRead) {
      return message;
    }

    const [updatedMessage] = await db
      .update(messages)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(eq(messages.id, messageId))
      .returning();

    logger.info(`Message marked as read: ${messageId} by user ${userId}`);
    return updatedMessage;
  }

  async markChatMessagesAsRead(chatSessionId: string, userId: string): Promise<number> {
    // Verify user is participant in chat
    const isParticipant = await chatSessionService.verifyParticipant(chatSessionId, userId);
    if (!isParticipant) {
      throw new ForbiddenError('You are not a participant in this chat');
    }

    // Mark all unread messages in this chat as read (except user's own messages)
    const result = await db
      .update(messages)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(
        and(
          eq(messages.chatSessionId, chatSessionId),
          eq(messages.isRead, false),
          sql`${messages.senderId} != ${userId}`
        )
      )
      .returning();

    logger.info(`Marked ${result.length} messages as read in chat ${chatSessionId}`);
    return result.length;
  }

  async deleteMessage(messageId: string, userId: string): Promise<Message> {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    // Only sender can delete their own message
    if (message.senderId !== userId) {
      throw new ForbiddenError('You can only delete your own messages');
    }

    // Delete media attachments from Cloudinary if present
    if (message.mediaAttachments && Array.isArray(message.mediaAttachments)) {
      const publicIds = message.mediaAttachments.map((media: MessageMedia) => media.publicId);
      if (publicIds.length > 0) {
        await mediaService.deleteImages(publicIds);
      }
    }

    const [deletedMessage] = await db
      .update(messages)
      .set({
        isDeleted: true,
      })
      .where(eq(messages.id, messageId))
      .returning();

    logger.info(`Message deleted: ${messageId} by user ${userId}`);
    return deletedMessage;
  }

  async getUnreadCount(userId: string): Promise<number> {
    // Get all chat sessions where user is participant
    const chatSessions = await chatSessionService.getUserChatSessions(userId);
    
    if (chatSessions.length === 0) {
      return 0;
    }

    // Use Drizzle's inArray for safe parameter binding
    const chatSessionIds = chatSessions.map((chat) => chat.id);
    
    // Count unread messages in all user's chats (excluding user's own messages)
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(
        and(
          inArray(messages.chatSessionId, chatSessionIds),
          eq(messages.isRead, false),
          eq(messages.isDeleted, false),
          sql`${messages.senderId} != ${userId}`
        )
      );

    return Number(result.count);
  }

  async getUnreadCountByChat(chatSessionId: string, userId: string): Promise<number> {
    // Verify user is participant in chat
    const isParticipant = await chatSessionService.verifyParticipant(chatSessionId, userId);
    if (!isParticipant) {
      throw new ForbiddenError('You are not a participant in this chat');
    }

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(
        and(
          eq(messages.chatSessionId, chatSessionId),
          eq(messages.isRead, false),
          eq(messages.isDeleted, false),
          sql`${messages.senderId} != ${userId}`
        )
      );

    return Number(result.count);
  }

  async searchMessages(chatSessionId: string, userId: string, query: string): Promise<Message[]> {
    // Verify user is participant in chat
    const isParticipant = await chatSessionService.verifyParticipant(chatSessionId, userId);
    if (!isParticipant) {
      throw new ForbiddenError('You are not a participant in this chat');
    }

    if (!query || query.trim().length === 0) {
      throw new BadRequestError('Search query cannot be empty');
    }

    return db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.chatSessionId, chatSessionId),
          eq(messages.isDeleted, false),
          like(messages.content, `%${query.trim()}%`)
        )
      )
      .orderBy(desc(messages.sentAt))
      .limit(50);
  }

  async getDailyMessageCount(userId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(and(eq(messages.senderId, userId), gte(messages.sentAt, startOfDay)));

    return Number(result.count);
  }

  private async checkDailyMessageLimit(userId: string): Promise<void> {
    const plan = await subscriptionService.getUserPlan(userId);
    const limit = DAILY_MESSAGE_LIMITS[plan];

    // -1 means unlimited
    if (limit === -1) return;

    const messageCount = await this.getDailyMessageCount(userId);

    if (messageCount >= limit) {
      throw new TooManyRequestsError(
        `Daily message limit reached for ${plan} plan (${messageCount}/${limit})`
      );
    }
  }

  async getLastMessage(chatSessionId: string): Promise<Message | null> {
    const [message] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.chatSessionId, chatSessionId), eq(messages.isDeleted, false)))
      .orderBy(desc(messages.sentAt))
      .limit(1);

    return message || null;
  }
}

export const messageService = new MessageService();
