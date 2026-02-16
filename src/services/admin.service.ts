import { eq, and, desc, sql, gte, lte, or, count } from 'drizzle-orm';
import { db } from '../db';
import { users, qrCodes, callSessions, chatSessions, messages, subscriptions } from '../models';
import { logger, NotFoundError, ForbiddenError } from '../utils';

export class AdminService {
  // ==================== OVERVIEW STATS ====================
  
  async getOverviewStats() {
    // Get user counts by status
    const userStats = await db
      .select({
        status: users.status,
        count: sql<number>`count(*)`,
      })
      .from(users)
      .groupBy(users.status);

    // Get QR code counts by status
    const qrStats = await db
      .select({
        status: qrCodes.status,
        count: sql<number>`count(*)`,
      })
      .from(qrCodes)
      .groupBy(qrCodes.status);

    // Get today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayCalls] = await db
      .select({ count: sql<number>`count(*)` })
      .from(callSessions)
      .where(gte(callSessions.startedAt, today));

    const [todayChats] = await db
      .select({ count: sql<number>`count(*)` })
      .from(chatSessions)
      .where(gte(chatSessions.startedAt, today));

    const [todayMessages] = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(gte(messages.sentAt, today));

    // Get active calls and chats
    const [activeCalls] = await db
      .select({ count: sql<number>`count(*)` })
      .from(callSessions)
      .where(
        or(
          eq(callSessions.status, 'initiated'),
          eq(callSessions.status, 'ringing'),
          eq(callSessions.status, 'connected')
        )
      );

    const [activeChats] = await db
      .select({ count: sql<number>`count(*)` })
      .from(chatSessions)
      .where(eq(chatSessions.status, 'active'));

    return {
      users: {
        total: userStats.reduce((sum, stat) => sum + Number(stat.count), 0),
        active: userStats.find((s) => s.status === 'active')?.count || 0,
        blocked: userStats.find((s) => s.status === 'blocked')?.count || 0,
        deleted: userStats.find((s) => s.status === 'deleted')?.count || 0,
      },
      qrCodes: {
        total: qrStats.reduce((sum, stat) => sum + Number(stat.count), 0),
        unassigned: qrStats.find((s) => s.status === 'unassigned')?.count || 0,
        active: qrStats.find((s) => s.status === 'active')?.count || 0,
        disabled: qrStats.find((s) => s.status === 'disabled')?.count || 0,
        revoked: qrStats.find((s) => s.status === 'revoked')?.count || 0,
      },
      calls: {
        today: Number(todayCalls.count),
        active: Number(activeCalls.count),
      },
      chats: {
        today: Number(todayChats.count),
        active: Number(activeChats.count),
      },
      messages: {
        today: Number(todayMessages.count),
      },
    };
  }

  // ==================== USER MANAGEMENT ====================

  async getAllUsers(filters?: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const { status, search, limit = 50, offset = 0 } = filters || {};

    let query = db.select().from(users);

    // Apply filters
    const conditions = [];
    if (status) {
      conditions.push(eq(users.status, status as any));
    }
    if (search) {
      conditions.push(sql`${users.username} ILIKE ${`%${search}%`}`);
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const usersList = await query
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return {
      users: usersList,
      total: Number(totalResult.count),
      limit,
      offset,
    };
  }

  async getUserDetails(userId: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Get user's QR codes
    const userQRCodes = await db
      .select()
      .from(qrCodes)
      .where(eq(qrCodes.assignedUserId, userId));

    // Get user's subscription
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')))
      .limit(1);

    // Get call stats
    const [callStats] = await db
      .select({
        totalCalls: sql<number>`count(*)`,
      })
      .from(callSessions)
      .where(or(eq(callSessions.callerId, userId), eq(callSessions.receiverId, userId)));

    // Get chat stats
    const [chatStats] = await db
      .select({
        totalChats: sql<number>`count(*)`,
      })
      .from(chatSessions)
      .where(
        or(eq(chatSessions.participant1Id, userId), eq(chatSessions.participant2Id, userId))
      );

    // Get message stats
    const [messageStats] = await db
      .select({
        totalMessages: sql<number>`count(*)`,
      })
      .from(messages)
      .where(eq(messages.senderId, userId));

    return {
      user,
      qrCodes: userQRCodes,
      subscription: subscription || null,
      stats: {
        totalCalls: Number(callStats.totalCalls),
        totalChats: Number(chatStats.totalChats),
        totalMessages: Number(messageStats.totalMessages),
      },
    };
  }

  // ==================== QR CODE MANAGEMENT ====================

  async getAllQRCodes(filters?: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const { status, search, limit = 50, offset = 0 } = filters || {};

    let query = db.select().from(qrCodes);

    const conditions = [];
    if (status) {
      conditions.push(eq(qrCodes.status, status as any));
    }
    if (search) {
      conditions.push(
        or(
          sql`${qrCodes.humanToken} ILIKE ${`%${search}%`}`,
          sql`${qrCodes.token} ILIKE ${`%${search}%`}`
        )
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const qrCodesList = await query
      .orderBy(desc(qrCodes.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(qrCodes)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return {
      qrCodes: qrCodesList,
      total: Number(totalResult.count),
      limit,
      offset,
    };
  }

  async getQRCodeDetails(qrCodeId: string) {
    const [qrCode] = await db
      .select()
      .from(qrCodes)
      .where(eq(qrCodes.id, qrCodeId))
      .limit(1);

    if (!qrCode) {
      throw new NotFoundError('QR code not found');
    }

    // Get assigned user if any
    let assignedUser = null;
    if (qrCode.assignedUserId) {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, qrCode.assignedUserId))
        .limit(1);
      assignedUser = user;
    }

    // Get usage stats
    const [callStats] = await db
      .select({ count: sql<number>`count(*)` })
      .from(callSessions)
      .where(eq(callSessions.qrId, qrCodeId));

    const [chatStats] = await db
      .select({ count: sql<number>`count(*)` })
      .from(chatSessions)
      .where(eq(chatSessions.qrId, qrCodeId));

    return {
      qrCode,
      assignedUser,
      usage: {
        totalCalls: Number(callStats.count),
        totalChats: Number(chatStats.count),
      },
    };
  }

  // ==================== CALL HISTORY ====================

  async getCallHistory(filters?: {
    startDate?: Date;
    endDate?: Date;
    status?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  }) {
    const { startDate, endDate, status, userId, limit = 50, offset = 0 } = filters || {};

    let query = db
      .select({
        call: callSessions,
        caller: {
          id: users.id,
          username: users.username,
        },
        receiver: {
          id: sql`receiver.id`,
          username: sql`receiver.username`,
        },
        qrCode: {
          id: qrCodes.id,
          humanToken: qrCodes.humanToken,
        },
      })
      .from(callSessions)
      .leftJoin(users, eq(callSessions.callerId, users.id))
      .leftJoin(sql`users as receiver`, sql`${callSessions.receiverId} = receiver.id`)
      .leftJoin(qrCodes, eq(callSessions.qrId, qrCodes.id));

    const conditions = [];
    if (startDate) {
      conditions.push(gte(callSessions.startedAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(callSessions.startedAt, endDate));
    }
    if (status) {
      conditions.push(eq(callSessions.status, status as any));
    }
    if (userId) {
      conditions.push(
        or(eq(callSessions.callerId, userId), eq(callSessions.receiverId, userId))
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const calls = await query
      .orderBy(desc(callSessions.startedAt))
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(callSessions)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return {
      calls,
      total: Number(totalResult.count),
      limit,
      offset,
    };
  }

  async getCallDetails(callId: string) {
    const [call] = await db
      .select()
      .from(callSessions)
      .where(eq(callSessions.id, callId))
      .limit(1);

    if (!call) {
      throw new NotFoundError('Call not found');
    }

    // Get caller details
    const [caller] = await db
      .select()
      .from(users)
      .where(eq(users.id, call.callerId))
      .limit(1);

    // Get receiver details
    const [receiver] = await db
      .select()
      .from(users)
      .where(eq(users.id, call.receiverId))
      .limit(1);

    // Get QR code details
    const [qrCode] = await db
      .select()
      .from(qrCodes)
      .where(eq(qrCodes.id, call.qrId))
      .limit(1);

    // Calculate duration
    let duration = null;
    if (call.startedAt && call.endedAt) {
      duration = Math.floor(
        (call.endedAt.getTime() - call.startedAt.getTime()) / 1000
      );
    }

    return {
      call,
      caller,
      receiver,
      qrCode,
      duration,
    };
  }

  // ==================== CHAT HISTORY ====================

  async getChatHistory(filters?: {
    startDate?: Date;
    endDate?: Date;
    status?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  }) {
    const { startDate, endDate, status, userId, limit = 50, offset = 0 } = filters || {};

    let query = db
      .select({
        chat: chatSessions,
        participant1: {
          id: users.id,
          username: users.username,
        },
        participant2: {
          id: sql`participant2.id`,
          username: sql`participant2.username`,
        },
        qrCode: {
          id: qrCodes.id,
          humanToken: qrCodes.humanToken,
        },
      })
      .from(chatSessions)
      .leftJoin(users, eq(chatSessions.participant1Id, users.id))
      .leftJoin(sql`users as participant2`, sql`${chatSessions.participant2Id} = participant2.id`)
      .leftJoin(qrCodes, eq(chatSessions.qrId, qrCodes.id));

    const conditions = [];
    if (startDate) {
      conditions.push(gte(chatSessions.startedAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(chatSessions.startedAt, endDate));
    }
    if (status) {
      conditions.push(eq(chatSessions.status, status as any));
    }
    if (userId) {
      conditions.push(
        or(
          eq(chatSessions.participant1Id, userId),
          eq(chatSessions.participant2Id, userId)
        )
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const chats = await query
      .orderBy(desc(chatSessions.startedAt))
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(chatSessions)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return {
      chats,
      total: Number(totalResult.count),
      limit,
      offset,
    };
  }

  async getChatDetails(chatId: string) {
    const [chat] = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, chatId))
      .limit(1);

    if (!chat) {
      throw new NotFoundError('Chat not found');
    }

    // Get participant1 details
    const [participant1] = await db
      .select()
      .from(users)
      .where(eq(users.id, chat.participant1Id))
      .limit(1);

    // Get participant2 details
    const [participant2] = await db
      .select()
      .from(users)
      .where(eq(users.id, chat.participant2Id))
      .limit(1);

    // Get QR code details
    const [qrCode] = await db
      .select()
      .from(qrCodes)
      .where(eq(qrCodes.id, chat.qrId))
      .limit(1);

    // Get message count
    const [messageCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(eq(messages.chatSessionId, chatId));

    return {
      chat,
      participant1,
      participant2,
      qrCode,
      messageCount: Number(messageCount.count),
    };
  }
}

export const adminService = new AdminService();
