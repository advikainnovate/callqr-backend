import { Response } from 'express';
import { callSessionService } from '../services/callSession.service';
import { subscriptionService } from '../services/subscription.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { asyncHandler, UnauthorizedError } from '../utils';
import { sendSuccessResponse } from '../utils/responseHandler';

export class CallController {
  private normalizeLimit(raw: unknown, fallback: number, max: number): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(1, Math.min(max, Math.trunc(parsed)));
  }

  initiateCall = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;
      const callerId = identity?.type === 'user' ? identity.userId : undefined;
      const guestId = identity?.type === 'guest' ? identity.guestId : undefined;
      const guestIp = identity?.type === 'guest' ? identity.guestIp : req.ip;
      const { qrToken } = req.body;

      const callSession = await callSessionService.initiateCall(
        qrToken,
        callerId,
        guestId,
        guestIp
      );

      sendSuccessResponse(res, 201, 'Call initiated successfully', {
        callId: callSession.id,
        callerId: callSession.callerId,
        guestId: callSession.guestId,
        receiverId: callSession.receiverId,
        status: callSession.status,
        initiatedAt: callSession.initiatedAt,
        startedAt: callSession.startedAt,
      });
    }
  );

  getCallSession = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { callId } = req.params;
      const identity = req.identity;

      if (!identity) {
        throw new UnauthorizedError('Authentication required');
      }

      const actorId =
        identity.type === 'user'
          ? identity.userId
          : `guest:${identity.guestId}`;

      const callSession = await callSessionService.getCallSessionForActor(
        callId,
        actorId
      );

      sendSuccessResponse(res, 200, 'Call session retrieved successfully', {
        id: callSession.id,
        callerId: callSession.callerId,
        guestId: callSession.guestId,
        receiverId: callSession.receiverId,
        callerName: callSession.callerName,
        receiverName: callSession.receiverName,
        qrId: callSession.qrId,
        status: callSession.status,
        endedReason: callSession.endedReason,
        initiatedAt: callSession.initiatedAt,
        startedAt: callSession.startedAt,
        endedAt: callSession.endedAt,
      });
    }
  );

  updateCallStatus = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { callId } = req.params;
      const identity = req.identity;

      if (!identity) {
        throw new UnauthorizedError('Authentication required');
      }

      const userId =
        identity.type === 'user'
          ? identity.userId
          : `guest:${identity.guestId}`;

      const { status, endedReason } = req.body;

      const callSession = await callSessionService.updateCallStatus(
        callId,
        userId,
        status,
        endedReason
      );

      sendSuccessResponse(res, 200, 'Call status updated successfully', {
        id: callSession.id,
        status: callSession.status,
        endedReason: callSession.endedReason,
        endedAt: callSession.endedAt,
      });
    }
  );

  endCall = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { callId } = req.params;
    const identity = req.identity;

    if (!identity) {
      throw new UnauthorizedError('Authentication required');
    }

    const userId =
      identity.type === 'user' ? identity.userId : `guest:${identity.guestId}`;

    const { reason } = req.body;

    const callSession = await callSessionService.endCall(
      callId,
      userId,
      reason
    );

    sendSuccessResponse(res, 200, 'Call ended successfully', {
      id: callSession.id,
      status: callSession.status,
      endedReason: callSession.endedReason,
      endedAt: callSession.endedAt,
    });
  });

  acceptCall = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { callId } = req.params;
      const identity = req.identity;

      if (!identity) {
        throw new UnauthorizedError('Authentication required');
      }

      const userId =
        identity.type === 'user'
          ? identity.userId
          : `guest:${identity.guestId}`;

      const callSession = await callSessionService.acceptCall(callId, userId);

      sendSuccessResponse(res, 200, 'Call accepted successfully', {
        id: callSession.id,
        status: callSession.status,
      });
    }
  );

  rejectCall = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { callId } = req.params;
      const identity = req.identity;

      if (!identity) {
        throw new UnauthorizedError('Authentication required');
      }

      const userId =
        identity.type === 'user'
          ? identity.userId
          : `guest:${identity.guestId}`;

      const callSession = await callSessionService.rejectCall(callId, userId);

      sendSuccessResponse(res, 200, 'Call rejected successfully', {
        id: callSession.id,
        status: callSession.status,
        endedReason: callSession.endedReason,
      });
    }
  );

  getCallHistory = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;

      if (!identity) {
        throw new UnauthorizedError('Authentication required');
      }

      const userId =
        identity.type === 'user'
          ? identity.userId
          : `guest:${identity.guestId}`;

      const limit = this.normalizeLimit(req.query.limit, 50, 100);

      const callHistory = await callSessionService.getUserCallHistory(
        userId,
        limit
      );

      sendSuccessResponse(res, 200, 'Call history retrieved successfully', {
        calls: callHistory.map(call => ({
          id: call.id,
          callerId: call.callerId,
          guestId: call.guestId,
          receiverId: call.receiverId,
          callerName: call.callerName,
          receiverName: call.receiverName,
          status: call.status,
          endedReason: call.endedReason,
          initiatedAt: call.initiatedAt,
          startedAt: call.startedAt,
          endedAt: call.endedAt,
        })),
      });
    }
  );

  getActiveCalls = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;

      if (!identity) {
        throw new UnauthorizedError('Authentication required');
      }

      const userId =
        identity.type === 'user'
          ? identity.userId
          : `guest:${identity.guestId}`;

      const activeCalls = await callSessionService.getActiveCalls(userId);

      sendSuccessResponse(res, 200, 'Active calls retrieved successfully', {
        calls: activeCalls.map(call => ({
          id: call.id,
          callerId: call.callerId,
          guestId: call.guestId,
          receiverId: call.receiverId,
          status: call.status,
          initiatedAt: call.initiatedAt,
          startedAt: call.startedAt,
        })),
      });
    }
  );

  getCallUsage = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }

      const usage = await subscriptionService.getCallUsage(identity.userId);

      sendSuccessResponse(res, 200, 'Call usage retrieved successfully', usage);
    }
  );
}

export const callController = new CallController();
