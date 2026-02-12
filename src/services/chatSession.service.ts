import { eq, and, desc, sql, or } from 'drizzle-orm';
import { db } from '../db';
import { chatSessions, type NewChatSession, type ChatSession } from '../models';
import { v4 as uuidv4 } from 'uuid';
import { logger, NotFoundError, BadRequestError, ForbiddenError, TooManyRequestsError } from '../utils';
import { qrCodeService } from './qrCode.service';
import { userService } from './user.service';
import { subscriptionService } from './subscription.service';
import { ACTIVE_CHAT_LIMITS } from '../constants/subscriptions';

export class ChatSessionService {
  async initiateChat(initiatorId: string, qrToken: string): Promise<ChatSession> {
    // Validate QR code and get receiver info
    const qrCode = await qrCodeService.validateQRCode(qrToken);

    if (!qrCode.assignedUserId) {
      throw new BadRequestError('QR code is not assigned to any user');
    }

    // Get receiver details
    const receiver = await userService.getUserById(qrCode.assignedUserId);
    if (receiver.status !== 'active') {
      throw new BadRequestError('Receiver is not active');
    }

    // Check if initiator is trying to chat with themselves
    if (initiatorId === qrCode.assignedUserId) {
      throw new BadRequestError('Cannot chat with yourself');
    }

    // Check if chat session already exists between these users
    const existingChat = await this.getChatSessionByParticipants(initiatorId, qrCode.assignedUserId);
    if (existingChat && existingChat.status === 'active') {
      logger.info(`Returning existing chat session: ${existingChat.id}`);
      return existingChat;
    }

    // Check active chat limit for initiator
    await this.checkActiveChatLimit(initiatorId);

    // Create chat session
    const [chatSession] = await db
      .insert(chatSessions)
      .values({
        id: uuidv4(),
        participant1Id: initiatorId,
        participant2Id: qrCode.assignedUserId,
        qrId: qrCode.id,
        status: 'active',
        startedAt: new Date(),
      })
      .returning();

    logger.info(`Chat session initiated: ${chatSession.id} between ${initiatorId} and ${qrCode.assignedUserId}`);
    return chatSession;
  }

  async getChatSessionById(chatSessionId: string): Promise<ChatSession> {
    const [chatSession] = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, chatSessionId))
      .limit(1);

    if (!chatSession) {
      throw new NotFoundError('Chat session not found');
    }

    return chatSession;
  }

  async getChatSessionByParticipants(user1Id: string, user2Id: string): Promise<ChatSession | null> {
    const [chatSession] = await db
      .select()
      .from(chatSessions)
      .where(
        or(
          and(eq(chatSessions.participant1Id, user1Id), eq(chatSessions.participant2Id, user2Id)),
          and(eq(chatSessions.participant1Id, user2Id), eq(chatSessions.participant2Id, user1Id))
        )
      )
      .orderBy(desc(chatSessions.createdAt))
      .limit(1);

    return chatSession || null;
  }

  async getUserChatSessions(userId: string, limit: number = 50): Promise<ChatSession[]> {
    return db
      .select()
      .from(chatSessions)
      .where(or(eq(chatSessions.participant1Id, userId), eq(chatSessions.participant2Id, userId)))
      .orderBy(desc(chatSessions.lastMessageAt))
      .limit(limit);
  }

  async getActiveChatSessions(userId: string): Promise<ChatSession[]> {
    return db
      .select()
      .from(chatSessions)
      .where(
        and(
          or(eq(chatSessions.participant1Id, userId), eq(chatSessions.participant2Id, userId)),
          eq(chatSessions.status, 'active')
        )
      )
      .orderBy(desc(chatSessions.lastMessageAt));
  }

  async endChatSession(chatSessionId: string, userId: string): Promise<ChatSession> {
    const existingChat = await this.getChatSessionById(chatSessionId);

    // Authorization check
    if (existingChat.participant1Id !== userId && existingChat.participant2Id !== userId) {
      throw new ForbiddenError('You do not have permission to end this chat');
    }

    const [updatedChat] = await db
      .update(chatSessions)
      .set({
        status: 'ended',
        endedAt: new Date(),
      })
      .where(eq(chatSessions.id, chatSessionId))
      .returning();

    logger.info(`Chat session ended: ${chatSessionId} by user ${userId}`);
    return updatedChat;
  }

  async blockChatSession(chatSessionId: string, userId: string): Promise<ChatSession> {
    const existingChat = await this.getChatSessionById(chatSessionId);

    // Authorization check
    if (existingChat.participant1Id !== userId && existingChat.participant2Id !== userId) {
      throw new ForbiddenError('You do not have permission to block this chat');
    }

    const [updatedChat] = await db
      .update(chatSessions)
      .set({
        status: 'blocked',
        endedAt: new Date(),
      })
      .where(eq(chatSessions.id, chatSessionId))
      .returning();

    logger.info(`Chat session blocked: ${chatSessionId} by user ${userId}`);
    return updatedChat;
  }

  async updateLastMessageTime(chatSessionId: string): Promise<void> {
    await db
      .update(chatSessions)
      .set({
        lastMessageAt: new Date(),
      })
      .where(eq(chatSessions.id, chatSessionId));
  }

  async getActiveChatCount(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(chatSessions)
      .where(
        and(
          or(eq(chatSessions.participant1Id, userId), eq(chatSessions.participant2Id, userId)),
          eq(chatSessions.status, 'active')
        )
      );

    return Number(result.count);
  }

  private async checkActiveChatLimit(userId: string): Promise<void> {
    const plan = await subscriptionService.getUserPlan(userId);
    const limit = ACTIVE_CHAT_LIMITS[plan];

    // -1 means unlimited
    if (limit === -1) return;

    const activeCount = await this.getActiveChatCount(userId);

    if (activeCount >= limit) {
      throw new TooManyRequestsError(
        `Active chat limit reached for ${plan} plan (${activeCount}/${limit})`
      );
    }
  }

  async verifyParticipant(chatSessionId: string, userId: string): Promise<boolean> {
    const chatSession = await this.getChatSessionById(chatSessionId);
    return chatSession.participant1Id === userId || chatSession.participant2Id === userId;
  }

  async getOtherParticipantId(chatSessionId: string, userId: string): Promise<string> {
    const chatSession = await this.getChatSessionById(chatSessionId);
    
    if (chatSession.participant1Id === userId) {
      return chatSession.participant2Id;
    } else if (chatSession.participant2Id === userId) {
      return chatSession.participant1Id;
    }
    
    throw new ForbiddenError('You are not a participant in this chat');
  }
}

export const chatSessionService = new ChatSessionService();
