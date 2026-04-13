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

  private getCallerName(call: {
    callerName?: string | null;
    guestId?: string | null;
  }): string | null {
    if (call.callerName) return call.callerName;
    if (call.guestId) return 'Anonymous Caller';
    return null;
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
      const hydratedCall = await callSessionService.getCallSessionById(
        callSession.id
      );

      sendSuccessResponse(res, 201, 'Call initiated successfully', {
        callId: hydratedCall.id,
        callerId: hydratedCall.callerId,
        guestId: hydratedCall.guestId,
        receiverId: hydratedCall.receiverId,
        callerName: this.getCallerName(hydratedCall),
        receiverName: hydratedCall.receiverName,
        status: hydratedCall.status,
        initiatedAt: hydratedCall.initiatedAt,
        startedAt: hydratedCall.startedAt,
      });
    }
  );

  initiateCallFromChat = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const identity = req.identity;
      if (identity?.type !== 'user') {
        throw new UnauthorizedError('User authentication required');
      }

      const { chatSessionId } = req.body;

      const callSession = await callSessionService.initiateCallFromChat(
        identity.userId,
        chatSessionId
      );
      const hydratedCall = await callSessionService.getCallSessionById(
        callSession.id
      );

      sendSuccessResponse(res, 201, 'Call initiated from chat successfully', {
        callId: hydratedCall.id,
        callerId: hydratedCall.callerId,
        guestId: hydratedCall.guestId,
        receiverId: hydratedCall.receiverId,
        callerName: this.getCallerName(hydratedCall),
        receiverName: hydratedCall.receiverName,
        status: hydratedCall.status,
        initiatedAt: hydratedCall.initiatedAt,
        startedAt: hydratedCall.startedAt,
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
        callerName: this.getCallerName(callSession),
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
      const hydratedCall = await callSessionService.getCallSessionById(
        callSession.id
      );

      sendSuccessResponse(res, 200, 'Call status updated successfully', {
        id: hydratedCall.id,
        callerId: hydratedCall.callerId,
        guestId: hydratedCall.guestId,
        receiverId: hydratedCall.receiverId,
        callerName: this.getCallerName(hydratedCall),
        receiverName: hydratedCall.receiverName,
        status: hydratedCall.status,
        endedReason: hydratedCall.endedReason,
        initiatedAt: hydratedCall.initiatedAt,
        startedAt: hydratedCall.startedAt,
        endedAt: hydratedCall.endedAt,
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
    const hydratedCall = await callSessionService.getCallSessionById(
      callSession.id
    );

    sendSuccessResponse(res, 200, 'Call ended successfully', {
      id: hydratedCall.id,
      callerId: hydratedCall.callerId,
      guestId: hydratedCall.guestId,
      receiverId: hydratedCall.receiverId,
      callerName: this.getCallerName(hydratedCall),
      receiverName: hydratedCall.receiverName,
      status: hydratedCall.status,
      endedReason: hydratedCall.endedReason,
      initiatedAt: hydratedCall.initiatedAt,
      startedAt: hydratedCall.startedAt,
      endedAt: hydratedCall.endedAt,
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
      const hydratedCall = await callSessionService.getCallSessionById(
        callSession.id
      );

      sendSuccessResponse(res, 200, 'Call accepted successfully', {
        id: hydratedCall.id,
        callerId: hydratedCall.callerId,
        guestId: hydratedCall.guestId,
        receiverId: hydratedCall.receiverId,
        callerName: this.getCallerName(hydratedCall),
        receiverName: hydratedCall.receiverName,
        status: hydratedCall.status,
        initiatedAt: hydratedCall.initiatedAt,
        startedAt: hydratedCall.startedAt,
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
      const hydratedCall = await callSessionService.getCallSessionById(
        callSession.id
      );

      sendSuccessResponse(res, 200, 'Call rejected successfully', {
        id: hydratedCall.id,
        callerId: hydratedCall.callerId,
        guestId: hydratedCall.guestId,
        receiverId: hydratedCall.receiverId,
        callerName: this.getCallerName(hydratedCall),
        receiverName: hydratedCall.receiverName,
        status: hydratedCall.status,
        endedReason: hydratedCall.endedReason,
        initiatedAt: hydratedCall.initiatedAt,
        endedAt: hydratedCall.endedAt,
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
          callerName: this.getCallerName(call),
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
      const activeCallsWithNames = await Promise.all(
        activeCalls.map(call => callSessionService.getCallSessionById(call.id))
      );

      sendSuccessResponse(res, 200, 'Active calls retrieved successfully', {
        calls: activeCallsWithNames.map(call => ({
          id: call.id,
          callerId: call.callerId,
          guestId: call.guestId,
          receiverId: call.receiverId,
          callerName: this.getCallerName(call),
          receiverName: call.receiverName,
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
