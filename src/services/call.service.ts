import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db';
import { calls, type NewCall, type Call } from '../models';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils';
import { qrCodeService } from './qrCode.service';
import { userService } from './user.service';

export class CallService {
  async initiateCall(
    callerId: string,
    qrToken: string,
    callType: 'webrtc' | 'twilio' = 'webrtc'
  ): Promise<Call> {
    try {
      // Validate QR code and get receiver info
      const qrCode = await qrCodeService.validateQRCode(qrToken);
      if (!qrCode) {
        throw new Error('Invalid or expired QR code');
      }

      // Get receiver (QR code owner) details
      const receiver = await userService.getUserById(qrCode.userId);
      if (!receiver || !receiver.isActive) {
        throw new Error('QR code owner not found or inactive');
      }

      // Check if caller is trying to call themselves
      if (callerId === qrCode.userId) {
        throw new Error('Cannot call yourself');
      }

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

      // Update QR code scan count
      await qrCodeService.updateScanCount(qrToken);

      logger.info(`Call initiated: ${call.id} from ${callerId} to ${qrCode.userId}`);
      return call;
    } catch (error) {
      logger.error('Error initiating call:', error);
      throw error;
    }
  }

  async updateCallStatus(
    callId: string,
    status: 'initiated' | 'connected' | 'ended' | 'failed',
    duration?: number,
    metadata?: any
  ): Promise<Call | null> {
    try {
      const updateData: Partial<NewCall> = {
        status,
        updatedAt: new Date(),
      };

      if (duration !== undefined) {
        updateData.duration = duration;
      }

      if (metadata) {
        updateData.metadata = metadata;
      }

      if (status === 'connected') {
        updateData.startedAt = new Date();
      } else if (status === 'ended' || status === 'failed') {
        updateData.endedAt = new Date();
      }

      const [call] = await db
        .update(calls)
        .set(updateData)
        .where(eq(calls.id, callId))
        .returning();

      return call || null;
    } catch (error) {
      logger.error('Error updating call status:', error);
      throw error;
    }
  }

  async getCallById(callId: string): Promise<Call | null> {
    try {
      const [call] = await db
        .select()
        .from(calls)
        .where(eq(calls.id, callId))
        .limit(1);

      return call || null;
    } catch (error) {
      logger.error('Error fetching call by ID:', error);
      throw error;
    }
  }

  async getUserCalls(userId: string, limit: number = 50): Promise<Call[]> {
    try {
      const userCalls = await db
        .select()
        .from(calls)
        .where(and(
          eq(calls.callerId, userId)
        ))
        .orderBy(desc(calls.createdAt))
        .limit(limit);

      return userCalls;
    } catch (error) {
      logger.error('Error fetching user calls:', error);
      throw error;
    }
  }

  async getReceivedCalls(userId: string, limit: number = 50): Promise<Call[]> {
    try {
      const receivedCalls = await db
        .select()
        .from(calls)
        .where(and(
          eq(calls.receiverId, userId)
        ))
        .orderBy(desc(calls.createdAt))
        .limit(limit);

      return receivedCalls;
    } catch (error) {
      logger.error('Error fetching received calls:', error);
      throw error;
    }
  }

  async getActiveCalls(userId: string): Promise<Call[]> {
    try {
      const activeCalls = await db
        .select()
        .from(calls)
        .where(and(
          eq(calls.callerId, userId),
          eq(calls.status, 'connected')
        ))
        .orderBy(desc(calls.createdAt));

      return activeCalls;
    } catch (error) {
      logger.error('Error fetching active calls:', error);
      throw error;
    }
  }

  async endCall(callId: string, userId: string): Promise<boolean> {
    try {
      const call = await this.getCallById(callId);
      if (!call) {
        return false;
      }

      // Check if user is part of this call
      if (call.callerId !== userId && call.receiverId !== userId) {
        throw new Error('User is not part of this call');
      }

      const updatedCall = await this.updateCallStatus(callId, 'ended');
      return !!updatedCall;
    } catch (error) {
      logger.error('Error ending call:', error);
      throw error;
    }
  }

  async getCallHistory(userId: string, limit: number = 100): Promise<{
    made: Call[];
    received: Call[];
  }> {
    try {
      const [made, received] = await Promise.all([
        this.getUserCalls(userId, limit),
        this.getReceivedCalls(userId, limit)
      ]);

      return { made, received };
    } catch (error) {
      logger.error('Error fetching call history:', error);
      throw error;
    }
  }
}

export const callService = new CallService();
