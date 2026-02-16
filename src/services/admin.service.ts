import { eq, and, desc, sql, gte, lte, or, count } from 'drizzle-orm';
import { db } from '../db';
import { users, qrCodes, callSessions, chatSessions, messages, subscriptions, bugReports } from '../models';
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

  // ==================== ANALYTICS & CHARTS ====================

  async getCallAnalytics(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Total calls
    const [totalCalls] = await db
      .select({ count: sql<number>`count(*)` })
      .from(callSessions)
      .where(gte(callSessions.startedAt, startDate));

    // Calls by status
    const callsByStatus = await db
      .select({
        status: callSessions.status,
        count: sql<number>`count(*)`,
      })
      .from(callSessions)
      .where(gte(callSessions.startedAt, startDate))
      .groupBy(callSessions.status);

    // Average call duration (only for ended calls)
    const [avgDuration] = await db
      .select({
        avgDuration: sql<number>`AVG(EXTRACT(EPOCH FROM (${callSessions.endedAt} - ${callSessions.startedAt})))`,
      })
      .from(callSessions)
      .where(
        and(
          gte(callSessions.startedAt, startDate),
          eq(callSessions.status, 'ended'),
          sql`${callSessions.endedAt} IS NOT NULL`
        )
      );

    // Calls over time (daily)
    const callsOverTime = await db
      .select({
        date: sql<string>`DATE(${callSessions.startedAt})`,
        count: sql<number>`count(*)`,
      })
      .from(callSessions)
      .where(gte(callSessions.startedAt, startDate))
      .groupBy(sql`DATE(${callSessions.startedAt})`)
      .orderBy(sql`DATE(${callSessions.startedAt})`);

    // Calls by hour of day
    const callsByHour = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${callSessions.startedAt})`,
        count: sql<number>`count(*)`,
      })
      .from(callSessions)
      .where(gte(callSessions.startedAt, startDate))
      .groupBy(sql`EXTRACT(HOUR FROM ${callSessions.startedAt})`)
      .orderBy(sql`EXTRACT(HOUR FROM ${callSessions.startedAt})`);

    // Success rate
    const connectedCalls = callsByStatus.find((s) => s.status === 'connected')?.count || 0;
    const successRate = Number(totalCalls.count) > 0 
      ? (Number(connectedCalls) / Number(totalCalls.count)) * 100 
      : 0;

    return {
      totalCalls: Number(totalCalls.count),
      averageDuration: Math.round(Number(avgDuration.avgDuration) || 0),
      successRate: Math.round(successRate * 100) / 100,
      callsByStatus: callsByStatus.map((s) => ({
        status: s.status,
        count: Number(s.count),
      })),
      callsOverTime: callsOverTime.map((c) => ({
        date: c.date,
        count: Number(c.count),
      })),
      callsByHour: callsByHour.map((c) => ({
        hour: Number(c.hour),
        count: Number(c.count),
      })),
    };
  }

  async getChatAnalytics(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Total chats
    const [totalChats] = await db
      .select({ count: sql<number>`count(*)` })
      .from(chatSessions)
      .where(gte(chatSessions.startedAt, startDate));

    // Total messages
    const [totalMessages] = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(gte(messages.sentAt, startDate));

    // Average messages per chat
    const avgMessagesPerChat = Number(totalChats.count) > 0
      ? Number(totalMessages.count) / Number(totalChats.count)
      : 0;

    // Chats by status
    const chatsByStatus = await db
      .select({
        status: chatSessions.status,
        count: sql<number>`count(*)`,
      })
      .from(chatSessions)
      .where(gte(chatSessions.startedAt, startDate))
      .groupBy(chatSessions.status);

    // Messages over time (daily)
    const messagesOverTime = await db
      .select({
        date: sql<string>`DATE(${messages.sentAt})`,
        count: sql<number>`count(*)`,
      })
      .from(messages)
      .where(gte(messages.sentAt, startDate))
      .groupBy(sql`DATE(${messages.sentAt})`)
      .orderBy(sql`DATE(${messages.sentAt})`);

    // Messages by hour of day
    const messagesByHour = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${messages.sentAt})`,
        count: sql<number>`count(*)`,
      })
      .from(messages)
      .where(gte(messages.sentAt, startDate))
      .groupBy(sql`EXTRACT(HOUR FROM ${messages.sentAt})`)
      .orderBy(sql`EXTRACT(HOUR FROM ${messages.sentAt})`);

    // Message types distribution
    const messagesByType = await db
      .select({
        type: messages.messageType,
        count: sql<number>`count(*)`,
      })
      .from(messages)
      .where(gte(messages.sentAt, startDate))
      .groupBy(messages.messageType);

    // Read rate
    const [readStats] = await db
      .select({
        total: sql<number>`count(*)`,
        read: sql<number>`count(*) FILTER (WHERE ${messages.isRead} = true)`,
      })
      .from(messages)
      .where(gte(messages.sentAt, startDate));

    const readRate = Number(readStats.total) > 0
      ? (Number(readStats.read) / Number(readStats.total)) * 100
      : 0;

    return {
      totalChats: Number(totalChats.count),
      totalMessages: Number(totalMessages.count),
      averageMessagesPerChat: Math.round(avgMessagesPerChat * 100) / 100,
      readRate: Math.round(readRate * 100) / 100,
      chatsByStatus: chatsByStatus.map((s) => ({
        status: s.status,
        count: Number(s.count),
      })),
      messagesOverTime: messagesOverTime.map((m) => ({
        date: m.date,
        count: Number(m.count),
      })),
      messagesByHour: messagesByHour.map((m) => ({
        hour: Number(m.hour),
        count: Number(m.count),
      })),
      messagesByType: messagesByType.map((m) => ({
        type: m.type,
        count: Number(m.count),
      })),
    };
  }

  async getUserGrowthAnalytics(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // User registrations over time
    const userGrowth = await db
      .select({
        date: sql<string>`DATE(${users.createdAt})`,
        count: sql<number>`count(*)`,
      })
      .from(users)
      .where(gte(users.createdAt, startDate))
      .groupBy(sql`DATE(${users.createdAt})`)
      .orderBy(sql`DATE(${users.createdAt})`);

    return {
      userGrowth: userGrowth.map((u) => ({
        date: u.date,
        count: Number(u.count),
      })),
    };
  }

  // ==================== BUG REPORTS MANAGEMENT ====================

  async getAllBugReports(filters?: {
    status?: string;
    severity?: string;
    limit?: number;
    offset?: number;
  }) {
    const { status, severity, limit = 50, offset = 0 } = filters || {};

    let query = db
      .select({
        report: sql`bug_reports.*`,
        user: {
          id: users.id,
          username: users.username,
        },
      })
      .from(sql`bug_reports`)
      .leftJoin(users, sql`bug_reports.user_id = ${users.id}`);

    const conditions = [];
    if (status) {
      conditions.push(sql`bug_reports.status = ${status}`);
    }
    if (severity) {
      conditions.push(sql`bug_reports.severity = ${severity}`);
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const reports = await query
      .orderBy(sql`bug_reports.created_at DESC`)
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(sql`bug_reports`)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return {
      reports,
      total: Number(totalResult.count),
      limit,
      offset,
    };
  }

  async getBugReportStats() {
    // Reports by status
    const reportsByStatus = await db
      .select({
        status: sql`status`,
        count: sql<number>`count(*)`,
      })
      .from(sql`bug_reports`)
      .groupBy(sql`status`);

    // Reports by severity
    const reportsBySeverity = await db
      .select({
        severity: sql`severity`,
        count: sql<number>`count(*)`,
      })
      .from(sql`bug_reports`)
      .groupBy(sql`severity`);

    return {
      byStatus: reportsByStatus.map((r) => ({
        status: r.status,
        count: Number(r.count),
      })),
      bySeverity: reportsBySeverity.map((r) => ({
        severity: r.severity,
        count: Number(r.count),
      })),
    };
  }

  // ==================== SUBSCRIPTION MANAGEMENT ====================

  async getSubscriptionStats() {
    // Users by plan
    const usersByPlan = await db
      .select({
        plan: subscriptions.plan,
        count: sql<number>`count(DISTINCT ${subscriptions.userId})`,
      })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'active'))
      .groupBy(subscriptions.plan);

    // Total active subscriptions
    const [totalActive] = await db
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'active'));

    // Subscription changes over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const subscriptionChanges = await db
      .select({
        date: sql<string>`DATE(${subscriptions.createdAt})`,
        plan: subscriptions.plan,
        count: sql<number>`count(*)`,
      })
      .from(subscriptions)
      .where(gte(subscriptions.createdAt, thirtyDaysAgo))
      .groupBy(sql`DATE(${subscriptions.createdAt})`, subscriptions.plan)
      .orderBy(sql`DATE(${subscriptions.createdAt})`);

    return {
      totalActive: Number(totalActive.count),
      usersByPlan: usersByPlan.map((u) => ({
        plan: u.plan,
        count: Number(u.count),
      })),
      subscriptionChanges: subscriptionChanges.map((s) => ({
        date: s.date,
        plan: s.plan,
        count: Number(s.count),
      })),
    };
  }

  async getAllSubscriptions(filters?: {
    plan?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const { plan, status, limit = 50, offset = 0 } = filters || {};

    let query = db
      .select({
        subscription: subscriptions,
        user: {
          id: users.id,
          username: users.username,
        },
      })
      .from(subscriptions)
      .leftJoin(users, eq(subscriptions.userId, users.id));

    const conditions = [];
    if (plan) {
      conditions.push(eq(subscriptions.plan, plan as any));
    }
    if (status) {
      conditions.push(eq(subscriptions.status, status as any));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const subs = await query
      .orderBy(desc(subscriptions.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return {
      subscriptions: subs,
      total: Number(totalResult.count),
      limit,
      offset,
    };
  }
}

export const adminService = new AdminService();
