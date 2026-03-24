import { Response } from 'express';
import { callSessionService } from '../services/callSession.service';
import { subscriptionService } from '../services/subscription.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { asyncHandler, UnauthorizedError } from '../utils';
import { sendSuccessResponse } from '../utils/responseHandler';

export class CallController {
  initiateCall = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const callerId = req.user?.userId;
      const guestId = req.guestId;
      const guestIp = req.guestIp;
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
        startedAt: callSession.startedAt,
      });
    }
  );

  getCallSession = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { callId } = req.params;
      const callSession = await callSessionService.getCallSessionById(callId);

      sendSuccessResponse(res, 200, 'Call session retrieved successfully', {
        id: callSession.id,
        callerId: callSession.callerId,
        guestId: callSession.guestId,
        receiverId: callSession.receiverId,
        qrId: callSession.qrId,
        status: callSession.status,
        endedReason: callSession.endedReason,
        startedAt: callSession.startedAt,
        endedAt: callSession.endedAt,
      });
    }
  );

  updateCallStatus = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { callId } = req.params;
      const userId =
        req.user?.userId || (req.guestId ? `guest:${req.guestId}` : null);

      if (!userId) {
        throw new UnauthorizedError('Authentication required');
      }

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
    const userId =
      req.user?.userId || (req.guestId ? `guest:${req.guestId}` : null);

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

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
      const userId =
        req.user?.userId || (req.guestId ? `guest:${req.guestId}` : null);

      if (!userId) {
        throw new UnauthorizedError('Authentication required');
      }

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
      const userId =
        req.user?.userId || (req.guestId ? `guest:${req.guestId}` : null);

      if (!userId) {
        throw new UnauthorizedError('Authentication required');
      }

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
      const userId =
        req.user?.userId || (req.guestId ? `guest:${req.guestId}` : null);

      if (!userId) {
        throw new UnauthorizedError('Authentication required');
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

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
          status: call.status,
          endedReason: call.endedReason,
          startedAt: call.startedAt,
          endedAt: call.endedAt,
        })),
      });
    }
  );

  getActiveCalls = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const userId =
        req.user?.userId || (req.guestId ? `guest:${req.guestId}` : null);

      if (!userId) {
        throw new UnauthorizedError('Authentication required');
      }

      const activeCalls = await callSessionService.getActiveCalls(userId);

      sendSuccessResponse(res, 200, 'Active calls retrieved successfully', {
        calls: activeCalls.map(call => ({
          id: call.id,
          callerId: call.callerId,
          guestId: call.guestId,
          receiverId: call.receiverId,
          status: call.status,
          startedAt: call.startedAt,
        })),
      });
    }
  );

  getCallUsage = asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const userId = req.user!.userId;
      const usage = await subscriptionService.getCallUsage(userId);

      sendSuccessResponse(res, 200, 'Call usage retrieved successfully', usage);
    }
  );
}

export const callController = new CallController();
