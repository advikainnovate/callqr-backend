import { Request, Response } from 'express';
import { callService } from '../services/call.service';
import {
  UnauthorizedError,
  sendSuccessResponse
} from '../utils';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export class CallController {
  async initiateCall(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) throw new UnauthorizedError();

    const { qrToken, callType } = req.body;
    const call = await callService.initiateCall(userId, qrToken, callType);

    sendSuccessResponse(res, 201, 'Call initiated successfully', { call });
  }

  async updateCallStatus(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) throw new UnauthorizedError();

    const { callId } = req.params;
    const { status, duration } = req.body;

    const call = await callService.updateCallStatus(callId, userId, status, duration);

    sendSuccessResponse(res, 200, 'Call status updated successfully', { call });
  }

  async getCallHistory(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) throw new UnauthorizedError();

    const limit = parseInt(req.query.limit as string) || 50;
    const callHistory = await callService.getCallHistory(userId, Math.min(limit, 100));

    sendSuccessResponse(res, 200, undefined, { calls: callHistory });
  }

  async getActiveCalls(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) throw new UnauthorizedError();

    const activeCalls = await callService.getActiveCalls(userId);

    sendSuccessResponse(res, 200, undefined, { activeCalls });
  }

  async endCall(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) throw new UnauthorizedError();

    const { callId } = req.params;
    await callService.endCall(callId, userId);

    sendSuccessResponse(res, 200, 'Call ended successfully');
  }

  async getCallDetails(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) throw new UnauthorizedError();

    const { callId } = req.params;
    const call = await callService.getCallById(callId);

    // Authorization check (redundant but safe if getCallById doesn't check)
    if (call.callerId !== userId && call.receiverId !== userId) {
      const { ForbiddenError } = await import('../utils');
      throw new ForbiddenError('You are not authorized to view this call');
    }

    sendSuccessResponse(res, 200, undefined, { call });
  }

  async getCallUsage(req: Request, res: Response) {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) throw new UnauthorizedError();

    const usage = await callService.getCallUsage(userId);

    sendSuccessResponse(res, 200, undefined, { usage });
  }
}

export const callController = new CallController();
