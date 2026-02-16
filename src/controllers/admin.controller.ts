import { Response } from 'express';
import { adminService } from '../services/admin.service';
import { userService } from '../services/user.service';
import { qrCodeService } from '../services/qrCode.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { asyncHandler } from '../utils';
import { sendSuccessResponse } from '../utils/responseHandler';

export class AdminController {
  // ==================== OVERVIEW ====================

  getOverviewStats = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const stats = await adminService.getOverviewStats();
    sendSuccessResponse(res, 200, 'Overview stats retrieved successfully', stats);
  });

  // ==================== USER MANAGEMENT ====================

  getAllUsers = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status, search, limit, offset } = req.query;

    const result = await adminService.getAllUsers({
      status: status as string,
      search: search as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    sendSuccessResponse(res, 200, 'Users retrieved successfully', result);
  });

  getUserDetails = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { userId } = req.params;
    const details = await adminService.getUserDetails(userId);
    sendSuccessResponse(res, 200, 'User details retrieved successfully', details);
  });

  blockUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { userId } = req.params;
    const user = await userService.blockUser(userId);
    sendSuccessResponse(res, 200, 'User blocked successfully', {
      id: user.id,
      username: user.username,
      status: user.status,
    });
  });

  unblockUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { userId } = req.params;
    const user = await userService.activateUser(userId);
    sendSuccessResponse(res, 200, 'User unblocked successfully', {
      id: user.id,
      username: user.username,
      status: user.status,
    });
  });

  deleteUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { userId } = req.params;
    const user = await userService.deleteUser(userId);
    sendSuccessResponse(res, 200, 'User deleted successfully', {
      id: user.id,
      username: user.username,
      status: user.status,
    });
  });

  // ==================== QR CODE MANAGEMENT ====================

  getAllQRCodes = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status, search, limit, offset } = req.query;

    const result = await adminService.getAllQRCodes({
      status: status as string,
      search: search as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    sendSuccessResponse(res, 200, 'QR codes retrieved successfully', result);
  });

  getQRCodeDetails = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { qrCodeId } = req.params;
    const details = await adminService.getQRCodeDetails(qrCodeId);
    sendSuccessResponse(res, 200, 'QR code details retrieved successfully', details);
  });

  bulkCreateQRCodes = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { count } = req.body;
    const qrCodes = await qrCodeService.bulkCreateQRCodes(count);

    sendSuccessResponse(res, 201, `${count} QR codes created successfully`, {
      count: qrCodes.length,
      qrCodes: qrCodes.map((qr) => ({
        id: qr.id,
        token: qr.token,
        humanToken: qr.humanToken,
        status: qr.status,
        createdAt: qr.createdAt,
      })),
    });
  });

  assignQRCode = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { qrCodeId } = req.params;
    const { userId } = req.body;

    const qrCode = await qrCodeService.assignQRCode(qrCodeId, userId);

    sendSuccessResponse(res, 200, 'QR code assigned successfully', {
      id: qrCode.id,
      humanToken: qrCode.humanToken,
      assignedUserId: qrCode.assignedUserId,
      status: qrCode.status,
      assignedAt: qrCode.assignedAt,
    });
  });

  revokeQRCode = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { qrCodeId } = req.params;
    
    // Admin can revoke any QR code, so we get the QR first
    const qrDetails = await adminService.getQRCodeDetails(qrCodeId);
    
    if (!qrDetails.qrCode.assignedUserId) {
      return sendSuccessResponse(res, 400, 'Cannot revoke unassigned QR code', null);
    }

    const qrCode = await qrCodeService.revokeQRCode(qrCodeId, qrDetails.qrCode.assignedUserId);

    sendSuccessResponse(res, 200, 'QR code revoked successfully', {
      id: qrCode.id,
      humanToken: qrCode.humanToken,
      status: qrCode.status,
    });
  });

  // ==================== CALL HISTORY ====================

  getCallHistory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { startDate, endDate, status, userId, limit, offset } = req.query;

    const result = await adminService.getCallHistory({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      status: status as string,
      userId: userId as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    sendSuccessResponse(res, 200, 'Call history retrieved successfully', result);
  });

  getCallDetails = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { callId } = req.params;
    const details = await adminService.getCallDetails(callId);
    sendSuccessResponse(res, 200, 'Call details retrieved successfully', details);
  });

  // ==================== CHAT HISTORY ====================

  getChatHistory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { startDate, endDate, status, userId, limit, offset } = req.query;

    const result = await adminService.getChatHistory({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      status: status as string,
      userId: userId as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    sendSuccessResponse(res, 200, 'Chat history retrieved successfully', result);
  });

  getChatDetails = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { chatId } = req.params;
    const details = await adminService.getChatDetails(chatId);
    sendSuccessResponse(res, 200, 'Chat details retrieved successfully', details);
  });
}

export const adminController = new AdminController();
