import { eq, and, desc, sql, gte, or, lt } from 'drizzle-orm';
import { db } from '../db';
import { callSessions, type NewCallSession, type CallSession } from '../models';
import { v4 as uuidv4 } from 'uuid';
import {
  logger,
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from '../utils';
import { qrCodeService } from './qrCode.service';
import { userService } from './user.service';
import { subscriptionService } from './subscription.service';

export class CallSessionService {
  async initiateCall(
    qrToken: string,
    callerId?: string,
    guestId?: string,
    guestIp?: string
  ): Promise<CallSession> {
    if (!callerId && !guestId) {
      throw new BadRequestError('Either callerId or guestId must be provided');
    }

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

    // Check if caller is trying to call themselves
    if (callerId && callerId === qrCode.assignedUserId) {
      throw new BadRequestError('Cannot call yourself');
    }

    // Check for blocking
    if (callerId) {
      const isBlocked = await userService.isUserBlocked(
        qrCode.assignedUserId,
        callerId
      );
      if (isBlocked) {
        throw new ForbiddenError('Unable to initiate call');
      }
    } else {
      // Anonymous caller
      const isBlocked = await userService.isGuestBlocked(
        qrCode.assignedUserId,
        guestId!,
        guestIp!
      );
      if (isBlocked) {
        throw new ForbiddenError('Unable to initiate call');
      }
    }

    // Check receiver's daily call limit
    await subscriptionService.checkDailyCallLimit(qrCode.assignedUserId);

    // Create call session
    const [callSession] = await db
      .insert(callSessions)
      .values({
        id: uuidv4(),
        callerId: callerId || null,
        guestId: guestId || null,
        guestIp: guestIp || null,
        callerType: callerId ? 'registered' : 'anonymous',
        receiverId: qrCode.assignedUserId,
        qrId: qrCode.id,
        status: 'initiated',
      })
      .returning();

    logger.info(
      `Call session initiated: ${callSession.id} from ${callerId || guestId} to ${qrCode.assignedUserId}`
    );
    return callSession;
  }

  async updateCallStatus(
    callId: string,
    userId: string,
    status: 'initiated' | 'ringing' | 'connected' | 'ended' | 'failed',
    endedReason?: 'busy' | 'rejected' | 'timeout' | 'error'
  ): Promise<CallSession> {
    const existingCall = await this.getCallSessionById(callId);

    // Authorization check
    let isAuthorized = false;
    if (userId.startsWith('guest:')) {
      const guestId = userId.split(':')[1];
      isAuthorized =
        existingCall.guestId === guestId || existingCall.receiverId === userId;
    } else {
      isAuthorized =
        existingCall.callerId === userId || existingCall.receiverId === userId;
    }

    if (!isAuthorized) {
      throw new ForbiddenError(
        'You do not have permission to update this call'
      );
    }

    const updateData: Partial<NewCallSession> = {
      status,
    };

    if (endedReason) {
      updateData.endedReason = endedReason;
    }

    if (status === 'connected' && existingCall.status !== 'connected') {
      updateData.startedAt = new Date(); // record when media actually started
    }

    if (status === 'ended' || status === 'failed') {
      updateData.endedAt = new Date();
    }

    const [updatedCall] = await db
      .update(callSessions)
      .set(updateData)
      .where(eq(callSessions.id, callId))
      .returning();

    logger.info(`Call session ${callId} updated to status: ${status}`);
    return updatedCall;
  }

  async getCallSessionById(callId: string): Promise<CallSession> {
    const [callSession] = await db
      .select()
      .from(callSessions)
      .where(eq(callSessions.id, callId))
      .limit(1);

    if (!callSession) {
      throw new NotFoundError('Call session not found');
    }

    return callSession;
  }

  async getUserCallHistory(
    userId: string,
    limit: number = 50
  ): Promise<CallSession[]> {
    const isGuest = userId.startsWith('guest:');
    const id = isGuest ? userId.split(':')[1] : userId;

    return db
      .select()
      .from(callSessions)
      .where(
        isGuest
          ? eq(callSessions.guestId, id)
          : or(eq(callSessions.callerId, id), eq(callSessions.receiverId, id))
      )
      .orderBy(desc(callSessions.startedAt))
      .limit(limit);
  }

  async getActiveCalls(userId: string): Promise<CallSession[]> {
    const isGuest = userId.startsWith('guest:');
    const id = isGuest ? userId.split(':')[1] : userId;

    return db
      .select()
      .from(callSessions)
      .where(
        and(
          isGuest
            ? eq(callSessions.guestId, id)
            : or(
                eq(callSessions.callerId, id),
                eq(callSessions.receiverId, id)
              ),
          or(
            eq(callSessions.status, 'initiated'),
            eq(callSessions.status, 'ringing'),
            eq(callSessions.status, 'connected')
          )
        )
      )
      .orderBy(desc(callSessions.startedAt));
  }

  async endCall(
    callId: string,
    userId: string,
    reason?: 'busy' | 'rejected' | 'timeout' | 'error'
  ): Promise<CallSession> {
    return this.updateCallStatus(callId, userId, 'ended', reason);
  }

  async rejectCall(callId: string, userId: string): Promise<CallSession> {
    return this.updateCallStatus(callId, userId, 'failed', 'rejected');
  }

  async acceptCall(callId: string, userId: string): Promise<CallSession> {
    const existingCall = await this.getCallSessionById(callId);

    // Only receiver can accept
    if (existingCall.receiverId !== userId) {
      throw new ForbiddenError('Only the receiver can accept the call');
    }

    // REST accept moves straight to connected (socket handler does the same)
    return this.updateCallStatus(callId, userId, 'connected');
  }

  async connectCall(callId: string, userId: string): Promise<CallSession> {
    return this.updateCallStatus(callId, userId, 'connected');
  }

  /**
   * Ends all active (initiated/ringing/connected) calls for a user.
   * Called when a user disconnects from the socket.
   */
  async endActiveCallsForUser(
    userId: string,
    reason: 'error' | 'timeout' = 'error'
  ): Promise<CallSession[]> {
    const activeCalls = await this.getActiveCalls(userId);
    const ended: CallSession[] = [];

    for (const call of activeCalls) {
      try {
        const updated = await db
          .update(callSessions)
          .set({ status: 'ended', endedReason: reason, endedAt: new Date() })
          .where(eq(callSessions.id, call.id))
          .returning();
        if (updated[0]) ended.push(updated[0]);
      } catch (err) {
        logger.error(`Failed to end call ${call.id} on disconnect:`, err);
      }
    }

    return ended;
  }

  /**
   * Times out calls that have been ringing/initiated for longer than maxAgeSeconds.
   * Should be called periodically (e.g. every 30s).
   */
  async timeoutStaleCalls(maxAgeSeconds: number = 60): Promise<CallSession[]> {
    const cutoff = new Date(Date.now() - maxAgeSeconds * 1000);

    const stale = await db
      .select()
      .from(callSessions)
      .where(
        and(
          or(
            eq(callSessions.status, 'initiated'),
            eq(callSessions.status, 'ringing')
          ),
          lt(callSessions.initiatedAt, cutoff)
        )
      );

    const timedOut: CallSession[] = [];
    for (const call of stale) {
      try {
        const [updated] = await db
          .update(callSessions)
          .set({ status: 'ended', endedReason: 'timeout', endedAt: new Date() })
          .where(eq(callSessions.id, call.id))
          .returning();
        if (updated) timedOut.push(updated);
      } catch (err) {
        logger.error(`Failed to timeout call ${call.id}:`, err);
      }
    }

    if (timedOut.length > 0) {
      logger.info(`Timed out ${timedOut.length} stale call(s)`);
    }

    return timedOut;
  }

  async getCallDuration(callId: string): Promise<number> {
    const callSession = await this.getCallSessionById(callId);

    if (!callSession.startedAt || !callSession.endedAt) {
      return 0;
    }

    const duration = Math.floor(
      (callSession.endedAt.getTime() - callSession.startedAt.getTime()) / 1000
    );

    return duration;
  }

  async getDailyCallCount(userId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(callSessions)
      .where(
        and(
          eq(callSessions.receiverId, userId),
          gte(callSessions.startedAt, startOfDay)
        )
      );

    return Number(result.count);
  }
}

export const callSessionService = new CallSessionService();
