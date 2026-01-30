import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { callService } from '../services/call.service';
import { initiateCallSchema, updateCallStatusSchema } from '../schemas/call.schema';
import { logger } from '../utils';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export class CallController {
  async initiateCall(req: Request, res: Response, next: NextFunction) {
    try {
      // Temporarily use a hardcoded valid UUID for testing
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      // const userId = req.user?.userId;
      // if (!userId) {
      //   return res.status(401).json({
      //     success: false,
      //     message: 'Unauthorized',
      //   });
      // }

      const validatedData = initiateCallSchema.parse(req.body);
      
      const call = await callService.initiateCall(
        userId,
        validatedData.qrToken,
        validatedData.callType
      );

      logger.info(`Call initiated by user: ${userId}`);

      res.status(201).json({
        success: true,
        message: 'Call initiated successfully',
        data: {
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
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.issues,
        });
      }

      if (error instanceof Error) {
        if (error.message === 'Invalid or expired QR code') {
          return res.status(404).json({
            success: false,
            message: error.message,
          });
        }
        if (error.message === 'QR code owner not found or inactive') {
          return res.status(404).json({
            success: false,
            message: error.message,
          });
        }
        if (error.message === 'Cannot call yourself') {
          return res.status(400).json({
            success: false,
            message: error.message,
          });
        }
      }

      next(error);
    }
  }

  async updateCallStatus(req: Request, res: Response, next: NextFunction) {
    try {
      // Temporarily use a hardcoded valid UUID for testing
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      // const userId = req.user?.userId;
      const { callId } = req.params;

      // if (!userId) {
      //   return res.status(401).json({
      //     success: false,
      //     message: 'Unauthorized',
      //   });
      // }

      const validatedData = updateCallStatusSchema.parse(req.body);
      
      // Check if user is part of this call
      const existingCall = await callService.getCallById(callId);
      if (!existingCall) {
        return res.status(404).json({
          success: false,
          message: 'Call not found',
        });
      }

      if (existingCall.callerId !== userId && existingCall.receiverId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to update this call',
        });
      }

      const call = await callService.updateCallStatus(
        callId,
        validatedData.status,
        validatedData.duration
      );

      if (!call) {
        return res.status(404).json({
          success: false,
          message: 'Call not found',
        });
      }

      logger.info(`Call status updated: ${callId} to ${validatedData.status}`);

      res.json({
        success: true,
        message: 'Call status updated successfully',
        data: {
          call: {
            id: call.id,
            status: call.status,
            duration: call.duration,
            startedAt: call.startedAt,
            endedAt: call.endedAt,
            updatedAt: call.updatedAt,
          },
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.issues,
        });
      }
      next(error);
    }
  }

  async getCallHistory(req: Request, res: Response, next: NextFunction) {
    try {
      // Temporarily use a hardcoded valid UUID for testing
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      // const userId = req.user?.userId;
      // if (!userId) {
      //   return res.status(401).json({
      //     success: false,
      //     message: 'Unauthorized',
      //   });
      // }

      const limit = parseInt(req.query.limit as string) || 50;
      const callHistory = await callService.getCallHistory(userId, Math.min(limit, 100));

      res.json({
        success: true,
        data: {
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
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getActiveCalls(req: Request, res: Response, next: NextFunction) {
    try {
      // Temporarily use a hardcoded valid UUID for testing
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      // const userId = req.user?.userId;
      // if (!userId) {
      //   return res.status(401).json({
      //     success: false,
      //     message: 'Unauthorized',
      //   });
      // }

      const activeCalls = await callService.getActiveCalls(userId);

      res.json({
        success: true,
        data: {
          activeCalls: activeCalls.map(call => ({
            id: call.id,
            receiverId: call.receiverId,
            callType: call.callType,
            startedAt: call.startedAt,
            createdAt: call.createdAt,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async endCall(req: Request, res: Response, next: NextFunction) {
    try {
      // Temporarily use a hardcoded valid UUID for testing
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      // const userId = req.user?.userId;
      const { callId } = req.params;

      // if (!userId) {
      //   return res.status(401).json({
      //     success: false,
      //     message: 'Unauthorized',
      //   });
      // }

      const success = await callService.endCall(callId, userId);

      if (!success) {
        return res.status(404).json({
          success: false,
          message: 'Call not found or you are not authorized to end this call',
        });
      }

      logger.info(`Call ended: ${callId} by user: ${userId}`);

      res.json({
        success: true,
        message: 'Call ended successfully',
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'User is not part of this call') {
          return res.status(403).json({
            success: false,
            message: error.message,
          });
        }
      }
      next(error);
    }
  }

  async getCallDetails(req: Request, res: Response, next: NextFunction) {
    try {
      // Temporarily use a hardcoded valid UUID for testing
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      // const userId = req.user?.userId;
      const { callId } = req.params;

      // if (!userId) {
      //   return res.status(401).json({
      //     success: false,
      //     message: 'Unauthorized',
      //   });
      // }

      const call = await callService.getCallById(callId);
      if (!call) {
        return res.status(404).json({
          success: false,
          message: 'Call not found',
        });
      }

      // Check if user is part of this call
      if (call.callerId !== userId && call.receiverId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to view this call',
        });
      }

      res.json({
        success: true,
        data: {
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
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const callController = new CallController();
