import { eq, and, desc, sql, gte, or, lt } from 'drizzle-orm';
import { db } from '../db';
import {
  users,
  callSessions,
  type NewCallSession,
  type CallSession,
} from '../models';
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
import { parseIdentity } from '../utils/identityUtils';
import { chatSessionService } from './chatSession.service';

type CallActor =
  | { kind: 'user'; id: string; rawId: string }
  | { kind: 'guest'; id: string; rawId: string }
  | { kind: 'system'; id: 'system'; rawId: 'system' };

type CallStatus = 'initiated' | 'ringing' | 'connected' | 'ended' | 'failed';
type CallEndReason = 'busy' | 'rejected' | 'timeout' | 'error' | 'completed';

export class CallSessionService {
  async initiateCallFromChat(
    callerId: string,
    chatSessionId: string
  ): Promise<CallSession> {
    const chatSession = await chatSessionService.getChatSessionForUser(
      chatSessionId,
      callerId
    );

    if (chatSession.status !== 'active') {
      throw new BadRequestError(
        `Cannot start a call from a ${chatSession.status} chat`
      );
    }

    const receiverId =
      chatSession.participant1Id === callerId
        ? chatSession.participant2Id
        : chatSession.participant1Id;

    if (!chatSession.qrId) {
      throw new BadRequestError('Chat session is missing its source QR');
    }

    const receiver = await userService.getUserById(receiverId);
    if (receiver.status !== 'active') {
      throw new BadRequestError('Receiver is not active');
    }

    const isBlocked = await userService.isUserBlocked(receiverId, callerId);
    if (isBlocked) {
      throw new ForbiddenError('Unable to initiate call');
    }

    await subscriptionService.checkDailyCallLimit(receiverId);

    const [callSession] = await db
      .insert(callSessions)
      .values({
        id: uuidv4(),
        callerId,
        guestId: null,
        guestIp: null,
        callerType: 'registered',
        receiverId,
        qrId: chatSession.qrId,
        status: 'initiated',
      })
      .returning();

    logger.info(
      `Call session initiated from chat ${chatSessionId}: ${callSession.id} from ${callerId} to ${receiverId}`
    );
    return callSession;
  }

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
    status: CallStatus,
    endedReason?: CallEndReason
  ): Promise<CallSession> {
    const actor = this.parseActor(userId);
    const existingCall = await this.getCallSessionById(callId);
    this.assertActorCanView(existingCall, actor, callId);

    if (status === 'ringing') {
      return this.transitionCall(existingCall, actor, 'ringing');
    }

    if (status === 'connected') {
      return this.transitionCall(existingCall, actor, 'connected');
    }

    if (status === 'ended') {
      return this.transitionCall(existingCall, actor, 'ended', endedReason);
    }

    if (status === 'failed') {
      return this.transitionCall(
        existingCall,
        actor,
        'failed',
        endedReason || 'error'
      );
    }

    throw new BadRequestError('Unsupported call status update');
  }

  async getCallSessionById(
    callId: string
  ): Promise<
    CallSession & { callerName?: string | null; receiverName?: string | null }
  > {
    const results = await db
      .select({
        call: callSessions,
        caller: {
          username: users.username,
        },
        receiver: {
          username: sql<string>`receiver.username`,
        },
      })
      .from(callSessions)
      .leftJoin(users, eq(callSessions.callerId, users.id))
      .leftJoin(
        sql`users as receiver`,
        sql`${callSessions.receiverId} = receiver.id`
      )
      .where(eq(callSessions.id, callId))
      .limit(1);

    const result = results[0];

    if (!result || !result.call) {
      throw new NotFoundError('Call session not found');
    }

    return {
      ...result.call,
      callerName: result.caller?.username || null,
      receiverName: result.receiver?.username || null,
    };
  }

  async getCallSessionForActor(
    callId: string,
    userId: string
  ): Promise<
    CallSession & { callerName?: string | null; receiverName?: string | null }
  > {
    const actor = this.parseActor(userId);
    const call = await this.getCallSessionById(callId);
    this.assertActorCanView(call, actor, callId);
    return call;
  }

  async getUserCallHistory(
    userId: string,
    limit: number = 50
  ): Promise<
    (CallSession & { callerName: string | null; receiverName: string | null })[]
  > {
    const identity = parseIdentity(userId);
    if (!identity) return [];

    const results = await db
      .select({
        call: callSessions,
        caller: {
          username: users.username,
        },
        receiver: {
          username: sql<string>`receiver.username`,
        },
      })
      .from(callSessions)
      .leftJoin(users, eq(callSessions.callerId, users.id))
      .leftJoin(
        sql`users as receiver`,
        sql`${callSessions.receiverId} = receiver.id`
      )
      .where(
        identity.type === 'guest'
          ? eq(callSessions.guestId, identity.id)
          : or(
              eq(callSessions.callerId, identity.id),
              eq(callSessions.receiverId, identity.id)
            )
      )
      .orderBy(desc(callSessions.initiatedAt))
      .limit(limit);

    return results.map(row => ({
      ...row.call,
      callerName: row.caller?.username || null,
      receiverName: row.receiver?.username || null,
    }));
  }

  async getActiveCalls(userId: string): Promise<CallSession[]> {
    const identity = parseIdentity(userId);
    if (!identity) return [];

    return db
      .select()
      .from(callSessions)
      .where(
        and(
          identity.type === 'guest'
            ? eq(callSessions.guestId, identity.id)
            : or(
                eq(callSessions.callerId, identity.id),
                eq(callSessions.receiverId, identity.id)
              ),
          or(
            eq(callSessions.status, 'initiated'),
            eq(callSessions.status, 'ringing'),
            eq(callSessions.status, 'connected')
          )
        )
      )
      .orderBy(desc(callSessions.initiatedAt));
  }

  async endCall(
    callId: string,
    userId: string,
    reason?: CallEndReason
  ): Promise<CallSession> {
    const actor = this.parseActor(userId);
    const call = await this.getCallSessionById(callId);
    this.assertActorCanView(call, actor, callId);
    return this.transitionCall(call, actor, 'ended', reason);
  }

  async rejectCall(callId: string, userId: string): Promise<CallSession> {
    const actor = this.parseActor(userId);
    const call = await this.getCallSessionById(callId);

    if (!this.isReceiver(call, actor)) {
      throw new ForbiddenError('Only the receiver can reject the call');
    }

    return this.transitionCall(call, actor, 'failed', 'rejected');
  }

  async acceptCall(callId: string, userId: string): Promise<CallSession> {
    const actor = this.parseActor(userId);
    const existingCall = await this.getCallSessionById(callId);

    if (!this.isReceiver(existingCall, actor)) {
      throw new ForbiddenError('Only the receiver can accept the call');
    }

    return this.transitionCall(existingCall, actor, 'connected');
  }

  async connectCall(callId: string, userId: string): Promise<CallSession> {
    const actor = this.parseActor(userId);
    const call = await this.getCallSessionById(callId);
    this.assertActorCanView(call, actor, callId);
    return this.transitionCall(call, actor, 'connected');
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
          gte(callSessions.initiatedAt, startOfDay)
        )
      );

    return Number(result.count);
  }

  private parseActor(rawUserId: string): CallActor {
    if (rawUserId === 'system') {
      return { kind: 'system', id: 'system', rawId: 'system' };
    }

    const identity = parseIdentity(rawUserId);
    if (!identity) {
      throw new ForbiddenError('Invalid user identity');
    }

    return identity.type === 'guest'
      ? { kind: 'guest', id: identity.id, rawId: rawUserId }
      : { kind: 'user', id: identity.id, rawId: rawUserId };
  }

  private assertActorCanView(
    call: CallSession,
    actor: CallActor,
    callId: string
  ): void {
    if (actor.kind === 'system') {
      return;
    }

    const isParticipant =
      call.receiverId === actor.id ||
      call.callerId === actor.id ||
      (actor.kind === 'guest' && call.guestId === actor.id);

    if (!isParticipant) {
      logger.warn(
        `Unauthorized call access attempt on ${callId} by ${actor.rawId}`
      );
      throw new ForbiddenError(
        'You do not have permission to access this call'
      );
    }
  }

  private isReceiver(call: CallSession, actor: CallActor): boolean {
    return actor.kind === 'user' && call.receiverId === actor.id;
  }

  private isCaller(call: CallSession, actor: CallActor): boolean {
    if (actor.kind === 'guest') {
      return call.guestId === actor.id;
    }

    if (actor.kind === 'user') {
      return call.callerId === actor.id;
    }

    return false;
  }

  private canTransition(
    call: CallSession,
    actor: CallActor,
    nextStatus: Exclude<CallStatus, 'initiated'>,
    endedReason?: CallEndReason
  ): void {
    if (actor.kind === 'system') {
      if (nextStatus === 'ended' || nextStatus === 'failed') {
        return;
      }
      throw new ForbiddenError('System cannot perform this call action');
    }

    if (call.status === 'ended' || call.status === 'failed') {
      throw new BadRequestError('Call has already finished');
    }

    if (nextStatus === 'ringing') {
      if (!this.isCaller(call, actor)) {
        throw new ForbiddenError('Only the caller can move a call to ringing');
      }
      if (call.status !== 'initiated') {
        throw new BadRequestError('Call can only ring after initiation');
      }
      return;
    }

    if (nextStatus === 'connected') {
      if (!this.isReceiver(call, actor)) {
        throw new ForbiddenError('Only the receiver can connect the call');
      }
      if (call.status !== 'initiated' && call.status !== 'ringing') {
        throw new BadRequestError('Only a pending call can be connected');
      }
      return;
    }

    if (nextStatus === 'failed') {
      if (!this.isReceiver(call, actor)) {
        throw new ForbiddenError('Only the receiver can reject the call');
      }
      if (call.status !== 'initiated' && call.status !== 'ringing') {
        throw new BadRequestError('Only a pending call can be rejected');
      }
      if (endedReason && endedReason !== 'rejected' && endedReason !== 'busy') {
        throw new BadRequestError(
          'Invalid failure reason for receiver rejection'
        );
      }
      return;
    }

    if (nextStatus === 'ended') {
      if (!this.isCaller(call, actor) && !this.isReceiver(call, actor)) {
        throw new ForbiddenError('Only participants can end the call');
      }
      return;
    }
  }

  private async transitionCall(
    call: CallSession,
    actor: CallActor,
    nextStatus: Exclude<CallStatus, 'initiated'>,
    endedReason?: CallEndReason
  ): Promise<CallSession> {
    this.canTransition(call, actor, nextStatus, endedReason);

    const updateData: Partial<NewCallSession> = { status: nextStatus };

    if (nextStatus === 'connected' && !call.startedAt) {
      updateData.startedAt = new Date();
    }

    if (nextStatus === 'ended' || nextStatus === 'failed') {
      updateData.endedAt = new Date();
      updateData.endedReason =
        endedReason || (nextStatus === 'failed' ? 'error' : null);
    }

    const [updatedCall] = await db
      .update(callSessions)
      .set(updateData)
      .where(eq(callSessions.id, call.id))
      .returning();

    logger.info(`Call session ${call.id} updated to status: ${nextStatus}`);
    return updatedCall;
  }
}

export const callSessionService = new CallSessionService();
