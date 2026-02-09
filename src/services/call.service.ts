import { eq, and, desc, sql, gte, or } from 'drizzle-orm';
import { db } from '../db';
import { calls, type NewCall, type Call, type User } from '../models';
import { v4 as uuidv4 } from 'uuid';
import { logger, NotFoundError, BadRequestError, ForbiddenError, TooManyRequestsError } from '../utils';
import { qrCodeService } from './qrCode.service';
import { userService } from './user.service';
import {
  SUBSCRIPTION_TIERS,
  DAILY_CALL_LIMITS,
} from '../constants/subscriptions';

export class CallService {
  async initiateCall(
    callerId: string,
    qrToken: string,
    callType: 'webrtc' | 'twilio' = 'webrtc'
  ): Promise<Call> {
    // Validate QR code and get receiver info
    const qrCode = await qrCodeService.validateQRCode(qrToken);

    // Get receiver (QR code owner) details
    const receiver = await userService.getUserById(qrCode.userId);
    if (!receiver.isActive) {
      throw new BadRequestError('QR code owner is inactive');
    }

    // Check if caller is trying to call themselves
    if (callerId === qrCode.userId) {
      throw new BadRequestError('Cannot call yourself');
    }

    // Check daily call limit for the receiver
    await this.checkDailyLimit(receiver);

    // Create call record
    const [call] = await db
      .insert(calls)
      .values({
        id: uuidv4(),
        callerId,
        receiverId: qrCode.userId,
        qrCodeId: qrCode.id,
        callType,
        status: 'initiated',
        startedAt: new Date(),
      })
      .returning();

    return call;
  }

  async updateCallStatus(
    callId: string,
    userId: string,
    status: 'initiated' | 'connected' | 'ended' | 'failed',
    duration?: number,
    metadata?: any
  ): Promise<Call> {
    const existingCall = await this.getCallById(callId);

    // Authorization check
    if (existingCall.callerId !== userId && existingCall.receiverId !== userId) {
      throw new ForbiddenError('You do not have permission to update this call');
    }

    const updateData: Partial<NewCall> = {
      status,
      updatedAt: new Date(),
    };

    if (duration !== undefined) updateData.duration = duration;
    if (metadata) updateData.metadata = metadata;

    if (status === 'connected') {
      updateData.startedAt = new Date();
    } else if (status === 'ended' || status === 'failed') {
      updateData.endedAt = new Date();
    }

    const [updatedCall] = await db
      .update(calls)
      .set(updateData)
      .where(eq(calls.id, callId))
      .returning();

    return updatedCall;
  }

  async getCallById(callId: string): Promise<Call> {
    const [call] = await db
      .select()
      .from(calls)
      .where(eq(calls.id, callId))
      .limit(1);

    if (!call) {
      throw new NotFoundError('Call not found');
    }

    return call;
  }

  async getUserCalls(userId: string, limit: number = 50): Promise<Call[]> {
    return db
      .select()
      .from(calls)
      .where(eq(calls.callerId, userId))
      .orderBy(desc(calls.createdAt))
      .limit(limit);
  }

  async getReceivedCalls(userId: string, limit: number = 50): Promise<Call[]> {
    return db
      .select()
      .from(calls)
      .where(eq(calls.receiverId, userId))
      .orderBy(desc(calls.createdAt))
      .limit(limit);
  }

  async getActiveCalls(userId: string): Promise<Call[]> {
    return db
      .select()
      .from(calls)
      .where(and(
        sql`(${calls.callerId} = ${userId} OR ${calls.receiverId} = ${userId})`,
        eq(calls.status, 'connected')
      ))
      .orderBy(desc(calls.createdAt));
  }

  async endCall(callId: string, userId: string): Promise<Call> {
    return this.updateCallStatus(callId, userId, 'ended');
  }

  async getCallHistory(userId: string, limit: number = 100): Promise<{ made: Call[]; received: Call[] }> {
    const [made, received] = await Promise.all([
      this.getUserCalls(userId, limit),
      this.getReceivedCalls(userId, limit),
    ]);

    return { made, received };
  }

  async getCallUsage(userId: string): Promise<{
    used: number;
    limit: number;
    tier: string;
    remaining: number;
  }> {
    const user = await userService.getUserById(userId);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const tier = (user.subscriptionTier as keyof typeof DAILY_CALL_LIMITS) || SUBSCRIPTION_TIERS.FREE;
    const limit = DAILY_CALL_LIMITS[tier];

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(calls)
      .where(
        and(eq(calls.receiverId, userId), gte(calls.createdAt, startOfDay))
      );

    const used = Number(result.count);
    return {
      used,
      limit,
      tier,
      remaining: Math.max(0, limit - used),
    };
  }

  private async checkDailyLimit(receiver: User): Promise<void> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const tier = (receiver.subscriptionTier as keyof typeof DAILY_CALL_LIMITS) || SUBSCRIPTION_TIERS.FREE;
    const limit = DAILY_CALL_LIMITS[tier];

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(calls)
      .where(
        and(
          eq(calls.receiverId, receiver.id),
          gte(calls.createdAt, startOfDay)
        )
      );

    if (Number(result.count) >= limit) {
      throw new TooManyRequestsError(`Daily limit for ${tier} tier reached.`);
    }
  }
}

export const callService = new CallService();
