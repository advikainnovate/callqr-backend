import { eq, and, desc, sql, gte, or } from 'drizzle-orm';
import { db } from '../db';
import {
  messages,
  type NewMessage,
  type Message,
  type MessageMedia,
  chatSessions,
  users,
} from '../models';
import { v4 as uuidv4 } from 'uuid';
import {
  logger,
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  TooManyRequestsError,
} from '../utils';
import { chatSessionService } from './chatSession.service';
import { subscriptionService } from './subscription.service';
import { mediaService } from './media.service';
import { userService } from './user.service';
import { DAILY_MESSAGE_LIMITS } from '../constants/subscriptions';
import crypto from 'crypto';
import { appConfig } from '../config';

export class MessageService {
  private readonly messageEncryptionPrefix = 'enc:';

  async sendMessage(
    chatSessionId: string,
    senderId: string,
    content: string,
    messageType: 'text' | 'image' = 'text',
    mediaFiles?: Express.Multer.File[]
  ): Promise<Message & { senderName?: string | null }> {
    // Validate input parameters
    if (!chatSessionId || !senderId) {
      throw new BadRequestError('Chat session ID and sender ID are required');
    }

    if (senderId.startsWith('guest:')) {
      throw new ForbiddenError(
        'Anonymous users cannot send messages. Please install the app.'
      );
    }

    // Verify sender is participant in chat
    const isParticipant = await chatSessionService.verifyParticipant(
      chatSessionId,
      senderId
    );
    if (!isParticipant) {
      throw new ForbiddenError('You are not a participant in this chat');
    }

    // Get chat session and verify it's active
    const chatSession =
      await chatSessionService.getChatSessionById(chatSessionId);
    if (chatSession.status !== 'active') {
      throw new BadRequestError(
        `Cannot send message to ${chatSession.status} chat`
      );
    }

    // NEW: Check if either participant has blocked the other
    const otherParticipantId =
      chatSession.participant1Id === senderId
        ? chatSession.participant2Id
        : chatSession.participant1Id;

    const isBlocked = await userService.isUserBlocked(
      otherParticipantId,
      senderId
    );
    if (isBlocked) {
      throw new ForbiddenError('Unable to send message');
    }

    // Check daily message limit
    await this.checkDailyMessageLimit(senderId);

    if (messageType !== 'text' && messageType !== 'image') {
      throw new BadRequestError('Unsupported message type');
    }

    // Validate content based on message type
    if (messageType === 'text') {
      if (!content || content.trim().length === 0) {
        throw new BadRequestError('Message content cannot be empty');
      }
      if (content.length > 5000) {
        throw new BadRequestError(
          'Message content exceeds maximum length of 5000 characters'
        );
      }
    }

    // Handle media uploads for image messages
    let mediaAttachments: MessageMedia[] | undefined;
    if (messageType === 'image' && mediaFiles && mediaFiles.length > 0) {
      try {
        const uploadResults = await mediaService.uploadImages(
          mediaFiles,
          senderId
        );
        mediaAttachments = uploadResults.map(result => ({
          ...result,
          thumbnailUrl: mediaService.generateImageUrls(result.publicId)
            .thumbnail,
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

    if (
      messageType === 'image' &&
      (!mediaAttachments || mediaAttachments.length === 0)
    ) {
      throw new BadRequestError(
        'At least one image is required for image messages'
      );
    }

    // Create message
    const [message] = await db
      .insert(messages)
      .values({
        id: uuidv4(),
        chatSessionId,
        senderId,
        messageType,
        content: this.encryptMessageContent((content || '').trim()),
        mediaAttachments,
        isRead: false,
        isDeleted: false,
        sentAt: new Date(),
      })
      .returning();

    // Update chat session's last message time
    await chatSessionService.updateLastMessageTime(chatSessionId);

    logger.info(
      `Message sent: ${message.id} in chat ${chatSessionId} (type: ${messageType})`
    );

    // Fetch sender username to include in the returned message
    const [sender] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, senderId))
      .limit(1);

    return {
      ...this.hydrateMessageContent(message),
      senderName: sender?.username || null,
    };
  }

  async getMessages(
    chatSessionId: string,
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<(Message & { senderName?: string | null })[]> {
    // Verify user is participant in chat
    const isParticipant = await chatSessionService.verifyParticipant(
      chatSessionId,
      userId
    );
    if (!isParticipant) {
      throw new ForbiddenError('You are not a participant in this chat');
    }

    const results = await db
      .select({
        msg: messages,
        sender: { username: users.username },
      })
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(
        and(
          eq(messages.chatSessionId, chatSessionId),
          eq(messages.isDeleted, false)
        )
      )
      .orderBy(desc(messages.sentAt))
      .limit(limit)
      .offset(offset);

    return results.reverse().map(result => ({
      ...this.hydrateMessageContent(result.msg),
      senderName: result.sender?.username || null,
    }));
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
    const isParticipant = await chatSessionService.verifyParticipant(
      message.chatSessionId,
      userId
    );
    if (!isParticipant) {
      throw new ForbiddenError('You are not a participant in this chat');
    }

    // Only mark as read if user is not the sender
    if (message.senderId === userId) {
      return this.hydrateMessageContent(message);
    }

    // Only update if not already read
    if (message.isRead) {
      return this.hydrateMessageContent(message);
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
    return this.hydrateMessageContent(updatedMessage);
  }

  async markChatMessagesAsRead(
    chatSessionId: string,
    userId: string
  ): Promise<number> {
    // Verify user is participant in chat
    const isParticipant = await chatSessionService.verifyParticipant(
      chatSessionId,
      userId
    );
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

    logger.info(
      `Marked ${result.length} messages as read in chat ${chatSessionId}`
    );
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
      const publicIds = message.mediaAttachments.map(
        (media: MessageMedia) => media.publicId
      );
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
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .innerJoin(chatSessions, eq(messages.chatSessionId, chatSessions.id))
      .where(
        and(
          or(
            eq(chatSessions.participant1Id, userId),
            eq(chatSessions.participant2Id, userId)
          ),
          eq(messages.isRead, false),
          eq(messages.isDeleted, false),
          sql`${messages.senderId} != ${userId}`
        )
      );

    return Number(result.count);
  }

  async getUnreadCountByChat(
    chatSessionId: string,
    userId: string
  ): Promise<number> {
    // Verify user is participant in chat
    const isParticipant = await chatSessionService.verifyParticipant(
      chatSessionId,
      userId
    );
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

  async searchMessages(
    chatSessionId: string,
    userId: string,
    query: string
  ): Promise<(Message & { senderName?: string | null })[]> {
    // Verify user is participant in chat
    const isParticipant = await chatSessionService.verifyParticipant(
      chatSessionId,
      userId
    );
    if (!isParticipant) {
      throw new ForbiddenError('You are not a participant in this chat');
    }

    if (!query || query.trim().length === 0) {
      throw new BadRequestError('Search query cannot be empty');
    }

    const normalizedQuery = query.trim().toLocaleLowerCase();

    const results = await db
      .select({
        msg: messages,
        sender: { username: users.username },
      })
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(
        and(
          eq(messages.chatSessionId, chatSessionId),
          eq(messages.isDeleted, false)
        )
      )
      .orderBy(desc(messages.sentAt));

    const matchedMessages = results
      .map(result => ({
        ...this.hydrateMessageContent(result.msg),
        senderName: result.sender?.username || null,
      }))
      .filter(result =>
        result.content.toLocaleLowerCase().includes(normalizedQuery)
      )
      .slice(0, 50)
      .reverse();

    return matchedMessages;
  }

  async getDailyMessageCount(userId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(
        and(eq(messages.senderId, userId), gte(messages.sentAt, startOfDay))
      );

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

  /** Lightweight fetch by primary key — for internal use only (no participant check). */
  async getMessageById(messageId: string): Promise<Message> {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    return this.hydrateMessageContent(message);
  }

  async getLastMessage(
    chatSessionId: string
  ): Promise<(Message & { senderName?: string | null }) | null> {
    const results = await db
      .select({
        msg: messages,
        sender: { username: users.username },
      })
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(
        and(
          eq(messages.chatSessionId, chatSessionId),
          eq(messages.isDeleted, false)
        )
      )
      .orderBy(desc(messages.sentAt))
      .limit(1);

    const result = results[0];
    return result
      ? {
          ...this.hydrateMessageContent(result.msg),
          senderName: result.sender?.username || null,
        }
      : null;
  }

  async markAsDelivered(messageId: string, userId: string): Promise<Message> {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    // Verify user is participant in chat
    const isParticipant = await chatSessionService.verifyParticipant(
      message.chatSessionId,
      userId
    );
    if (!isParticipant) {
      throw new ForbiddenError('You are not a participant in this chat');
    }

    // Only mark as delivered if user is not the sender and not already delivered
    if (message.senderId === userId || message.isDelivered) {
      return this.hydrateMessageContent(message);
    }

    const [updatedMessage] = await db
      .update(messages)
      .set({
        isDelivered: true,
        deliveredAt: new Date(),
      })
      .where(and(eq(messages.id, messageId), eq(messages.isDelivered, false)))
      .returning();

    logger.info(`Message marked as delivered: ${messageId} by user ${userId}`);
    return this.hydrateMessageContent(updatedMessage);
  }

  async markChatMessagesAsDelivered(
    chatSessionId: string,
    userId: string
  ): Promise<number> {
    // Verify user is participant in chat
    const isParticipant = await chatSessionService.verifyParticipant(
      chatSessionId,
      userId
    );
    if (!isParticipant) {
      throw new ForbiddenError('You are not a participant in this chat');
    }

    // Mark all undelivered messages in this chat as delivered (except user's own messages)
    const result = await db
      .update(messages)
      .set({
        isDelivered: true,
        deliveredAt: new Date(),
      })
      .where(
        and(
          eq(messages.chatSessionId, chatSessionId),
          eq(messages.isDelivered, false),
          sql`${messages.senderId} != ${userId}`
        )
      )
      .returning();

    logger.info(
      `Marked ${result.length} messages as delivered in chat ${chatSessionId}`
    );
    return result.length;
  }

  async getDeliveryStatus(
    messageId: string,
    userId: string
  ): Promise<{
    sent: boolean;
    delivered: boolean;
    read: boolean;
    sentAt: Date | null;
    deliveredAt: Date | null;
    readAt: Date | null;
  }> {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    // Verify user is participant in chat
    const isParticipant = await chatSessionService.verifyParticipant(
      message.chatSessionId,
      userId
    );
    if (!isParticipant) {
      throw new ForbiddenError('You are not a participant in this chat');
    }

    return {
      sent: true, // If message exists, it was sent
      delivered: message.isDelivered || false,
      read: message.isRead || false,
      sentAt: message.sentAt,
      deliveredAt: message.deliveredAt,
      readAt: message.readAt,
    };
  }

  private encryptMessageContent(content: string): string {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(appConfig.encryptionKey, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(content, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${this.messageEncryptionPrefix}${iv.toString('hex')}:${encrypted}`;
  }

  private decryptMessageContent(storedContent: string): string {
    if (!storedContent.startsWith(this.messageEncryptionPrefix)) {
      return storedContent;
    }

    try {
      const encryptedPayload = storedContent.slice(
        this.messageEncryptionPrefix.length
      );
      const parts = encryptedPayload.split(':');

      if (parts.length !== 2) {
        logger.warn('Invalid encrypted message format');
        return '[INVALID_MESSAGE]';
      }

      const algorithm = 'aes-256-cbc';
      const key = Buffer.from(appConfig.encryptionKey, 'hex');
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      logger.error('Message decryption failed:', error);
      return '[DECRYPTION_ERROR]';
    }
  }

  private hydrateMessageContent<T extends { content: string }>(message: T): T {
    return {
      ...message,
      content: this.decryptMessageContent(message.content),
    };
  }
}

export const messageService = new MessageService();
