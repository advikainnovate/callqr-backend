import { eq, and, desc, sql, gte, or } from 'drizzle-orm';
import { db } from '../db';
import { callSessions, type NewCallSession, type CallSession } from '../models';
import { v4 as uuidv4 } from 'uuid';
import { logger, NotFoundError, BadRequestError, ForbiddenError } from '../utils';
import { validateStatusTransition, CALL_STATUS_TRANSITIONS } from '../utils/statusTransitions';
import { qrCodeService } from './qrCode.service';
import { userService } from './user.service';
import { subscriptionService } from './subscription.service';

export class CallSessionService {
  async initiateCall(callerId: string, qrToken: string): Promise<CallSession> {
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
    if (callerId === qrCode.assignedUserId) {
      throw new BadRequestError('Cannot call yourself');
    }

    // Check receiver's daily call limit
    await subscriptionService.checkDailyCallLimit(qrCode.assignedUserId);

    // Create call session
    const [callSession] = await db
      .insert(callSessions)
      .values({
        id: uuidv4(),
        callerId,
        receiverId: qrCode.assignedUserId,
        qrId: qrCode.id,
        status: 'initiated',
        startedAt: new Date(),
      })
      .returning();

    logger.info(`Call session initiated: ${callSession.id} from ${callerId} to ${qrCode.assignedUserId}`);
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
    if (existingCall.callerId !== userId && existingCall.receiverId !== userId) {
      throw new ForbiddenError('You do not have permission to update this call');
    }

    // Validate status transition
    validateStatusTransition(existingCall.status, status, CALL_STATUS_TRANSITIONS, 'Call');

    const updateData: Partial<NewCallSession> = {
      status,
    };

    if (endedReason) {
      updateData.endedReason = endedReason;
    }

    if (status === 'connected' && existingCall.status !== 'connected') {
      updateData.startedAt = new Date();
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

  async getUserCallHistory(userId: string, limit: number = 50): Promise<CallSession[]> {
    return db
      .select()
      .from(callSessions)
      .where(or(eq(callSessions.callerId, userId), eq(callSessions.receiverId, userId)))
      .orderBy(desc(callSessions.startedAt))
      .limit(limit);
  }

  async getActiveCalls(userId: string): Promise<CallSession[]> {
    return db
      .select()
      .from(callSessions)
      .where(
        and(
          or(eq(callSessions.callerId, userId), eq(callSessions.receiverId, userId)),
          or(
            eq(callSessions.status, 'initiated'),
            eq(callSessions.status, 'ringing'),
            eq(callSessions.status, 'connected')
          )
        )
      )
      .orderBy(desc(callSessions.startedAt));
  }

  async endCall(callId: string, userId: string, reason?: 'busy' | 'rejected' | 'timeout' | 'error'): Promise<CallSession> {
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

    return this.updateCallStatus(callId, userId, 'ringing');
  }

  async connectCall(callId: string, userId: string): Promise<CallSession> {
    return this.updateCallStatus(callId, userId, 'connected');
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
      .where(and(eq(callSessions.receiverId, userId), gte(callSessions.startedAt, startOfDay)));

    return Number(result.count);
  }
}

export const callSessionService = new CallSessionService();
