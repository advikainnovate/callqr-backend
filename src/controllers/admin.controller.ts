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

  // ==================== ANALYTICS & CHARTS ====================

  getCallAnalytics = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const days = req.query.days ? parseInt(req.query.days as string) : 30;
    const analytics = await adminService.getCallAnalytics(days);
    sendSuccessResponse(res, 200, 'Call analytics retrieved successfully', analytics);
  });

  getChatAnalytics = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const days = req.query.days ? parseInt(req.query.days as string) : 30;
    const analytics = await adminService.getChatAnalytics(days);
    sendSuccessResponse(res, 200, 'Chat analytics retrieved successfully', analytics);
  });

  getUserGrowthAnalytics = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const days = req.query.days ? parseInt(req.query.days as string) : 30;
    const analytics = await adminService.getUserGrowthAnalytics(days);
    sendSuccessResponse(res, 200, 'User growth analytics retrieved successfully', analytics);
  });

  // ==================== BUG REPORTS MANAGEMENT ====================

  getAllBugReports = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status, severity, limit, offset } = req.query;

    const result = await adminService.getAllBugReports({
      status: status as string,
      severity: severity as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    sendSuccessResponse(res, 200, 'Bug reports retrieved successfully', result);
  });

  getBugReportStats = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const stats = await adminService.getBugReportStats();
    sendSuccessResponse(res, 200, 'Bug report stats retrieved successfully', stats);
  });

  // ==================== SUBSCRIPTION MANAGEMENT ====================

  getSubscriptionStats = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const stats = await adminService.getSubscriptionStats();
    sendSuccessResponse(res, 200, 'Subscription stats retrieved successfully', stats);
  });

  getAllSubscriptions = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { plan, status, limit, offset } = req.query;

    const result = await adminService.getAllSubscriptions({
      plan: plan as string,
      status: status as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });

    sendSuccessResponse(res, 200, 'Subscriptions retrieved successfully', result);
  });

  // ==================== REAL-TIME MONITORING ====================

  getActiveCallsList = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const activeCalls = await adminService.getActiveCallsList();
    sendSuccessResponse(res, 200, 'Active calls retrieved successfully', {
      calls: activeCalls,
      count: activeCalls.length,
    });
  });

  getActiveChatsList = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const activeChats = await adminService.getActiveChatsList();
    sendSuccessResponse(res, 200, 'Active chats retrieved successfully', {
      chats: activeChats,
      count: activeChats.length,
    });
  });

  getRecentActivity = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const activities = await adminService.getRecentActivity(limit);
    sendSuccessResponse(res, 200, 'Recent activity retrieved successfully', {
      activities,
      count: activities.length,
    });
  });

  getSystemHealth = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const health = await adminService.getSystemHealth();
    sendSuccessResponse(res, 200, 'System health retrieved successfully', health);
  });

  // ==================== REPORTS & EXPORT ====================

  exportUsers = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status } = req.query;
    const users = await adminService.exportUsers({ status: status as string });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=users-export.json');
    res.send(JSON.stringify(users, null, 2));
  });

  exportQRCodes = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status } = req.query;
    const qrCodes = await adminService.exportQRCodes({ status: status as string });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=qr-codes-export.json');
    res.send(JSON.stringify(qrCodes, null, 2));
  });

  exportCallHistory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { startDate, endDate, status } = req.query;

    const calls = await adminService.exportCallHistory({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      status: status as string,
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=call-history-export.json');
    res.send(JSON.stringify(calls, null, 2));
  });

  exportChatHistory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { startDate, endDate, status } = req.query;

    const chats = await adminService.exportChatHistory({
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      status: status as string,
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=chat-history-export.json');
    res.send(JSON.stringify(chats, null, 2));
  });

  generateUserGrowthReport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const days = req.query.days ? parseInt(req.query.days as string) : 30;
    const report = await adminService.generateUserGrowthReport(days);
    sendSuccessResponse(res, 200, 'User growth report generated successfully', report);
  });
}

export const adminController = new AdminController();
