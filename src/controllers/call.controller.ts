import { Request, Response } from 'express';
import { callService } from '../services/call.service';
import {
  logger,
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  sendSuccessResponse
} from '../utils';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export class CallController {
  async initiateCall(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) {
      throw new UnauthorizedError();
    }

    const { qrToken, callType } = req.body;

    try {
      const call = await callService.initiateCall(
        userId,
        qrToken,
        callType
      );

      logger.info(`Call initiated by user: ${userId}`);

      sendSuccessResponse(res, 201, 'Call initiated successfully', {
        call: {
          id: call.id,
          callerId: call.callerId,
          receiverId: call.receiverId,
          qrCodeId: call.qrCodeId,
          status: call.status,
          callType: call.callType,
          startedAt: call.startedAt,
          createdAt: call.createdAt,
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Invalid or expired QR code') {
          throw new NotFoundError(error.message);
        }
        if (error.message === 'QR code owner not found or inactive') {
          throw new NotFoundError(error.message);
        }
        if (error.message === 'Cannot call yourself') {
          throw new BadRequestError(error.message);
        }
      }
      throw error;
    }
  }

  async updateCallStatus(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    const { callId } = req.params;

    if (!userId) {
      throw new UnauthorizedError();
    }

    const { status, duration } = req.body;

    // Check if user is part of this call
    const existingCall = await callService.getCallById(callId);
    if (!existingCall) {
      throw new NotFoundError('Call not found');
    }

    if (existingCall.callerId !== userId && existingCall.receiverId !== userId) {
      throw new ForbiddenError('You are not authorized to update this call');
    }

    const call = await callService.updateCallStatus(
      callId,
      status,
      duration
    );

    if (!call) {
      throw new NotFoundError('Call not found');
    }

    logger.info(`Call status updated: ${callId} to ${status}`);

    sendSuccessResponse(res, 200, 'Call status updated successfully', {
      call: {
        id: call.id,
        status: call.status,
        duration: call.duration,
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        updatedAt: call.updatedAt,
      },
    });
  }

  async getCallHistory(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) {
      throw new UnauthorizedError();
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const callHistory = await callService.getCallHistory(userId, Math.min(limit, 100));

    sendSuccessResponse(res, 200, undefined, {
      calls: {
        made: callHistory.made.map(call => ({
          id: call.id,
          receiverId: call.receiverId,
          status: call.status,
          callType: call.callType,
          duration: call.duration,
          startedAt: call.startedAt,
          endedAt: call.endedAt,
          createdAt: call.createdAt,
        })),
        received: callHistory.received.map(call => ({
          id: call.id,
          callerId: call.callerId,
          status: call.status,
          callType: call.callType,
          duration: call.duration,
          startedAt: call.startedAt,
          endedAt: call.endedAt,
          createdAt: call.createdAt,
        })),
      },
    });
  }

  async getActiveCalls(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) {
      throw new UnauthorizedError();
    }

    const activeCalls = await callService.getActiveCalls(userId);

    sendSuccessResponse(res, 200, undefined, {
      activeCalls: activeCalls.map(call => ({
        id: call.id,
        receiverId: call.receiverId,
        callType: call.callType,
        startedAt: call.startedAt,
        createdAt: call.createdAt,
      })),
    });
  }

  async endCall(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    const { callId } = req.params;

    if (!userId) {
      throw new UnauthorizedError();
    }

    try {
      const success = await callService.endCall(callId, userId);

      if (!success) {
        throw new NotFoundError('Call not found or you are not authorized to end this call');
      }

      logger.info(`Call ended: ${callId} by user: ${userId}`);

      sendSuccessResponse(res, 200, 'Call ended successfully');
    } catch (error) {
      if (error instanceof Error && error.message === 'User is not part of this call') {
        throw new ForbiddenError(error.message);
      }
      throw error;
    }
  }

  async getCallDetails(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    const { callId } = req.params;

    if (!userId) {
      throw new UnauthorizedError();
    }

    const call = await callService.getCallById(callId);
    if (!call) {
      throw new NotFoundError('Call not found');
    }

    // Check if user is part of this call
    if (call.callerId !== userId && call.receiverId !== userId) {
      throw new ForbiddenError('You are not authorized to view this call');
    }

    sendSuccessResponse(res, 200, undefined, {
      call: {
        id: call.id,
        callerId: call.callerId,
        receiverId: call.receiverId,
        qrCodeId: call.qrCodeId,
        status: call.status,
        callType: call.callType,
        duration: call.duration,
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        createdAt: call.createdAt,
        updatedAt: call.updatedAt,
      },
    });
  }

  async getCallUsage(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) {
      throw new UnauthorizedError();
    }

    const usage = await callService.getCallUsage(userId);

    sendSuccessResponse(res, 200, undefined, {
      usage,
    });
  }
}

export const callController = new CallController();
