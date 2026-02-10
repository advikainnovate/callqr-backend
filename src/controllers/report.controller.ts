import { Response } from 'express';
import { bugReportService } from '../services/bugReport.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { asyncHandler } from '../utils';
import { sendSuccessResponse } from '../utils/responseHandler';

export class ReportController {
  createBugReport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { description, severity } = req.body;
    const userId = req.user?.userId; // Optional - allows anonymous reports

    const bugReport = await bugReportService.createBugReport(description, severity, userId);

    sendSuccessResponse(res, 201, 'Bug report created successfully', {
      id: bugReport.id,
      description: bugReport.description,
      severity: bugReport.severity,
      status: bugReport.status,
      createdAt: bugReport.createdAt,
    });
  });

  getBugReport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { reportId } = req.params;
    const bugReport = await bugReportService.getBugReportById(reportId);

    sendSuccessResponse(res, 200, 'Bug report retrieved successfully', {
      id: bugReport.id,
      userId: bugReport.userId,
      description: bugReport.description,
      severity: bugReport.severity,
      status: bugReport.status,
      createdAt: bugReport.createdAt,
    });
  });

  getMyBugReports = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    const bugReports = await bugReportService.getUserBugReports(userId, limit);

    sendSuccessResponse(res, 200, 'Bug reports retrieved successfully', {
      reports: bugReports.map((report) => ({
        id: report.id,
        description: report.description,
        severity: report.severity,
        status: report.status,
        createdAt: report.createdAt,
      })),
    });
  });

  getAllBugReports = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const bugReports = await bugReportService.getAllBugReports(limit);

    sendSuccessResponse(res, 200, 'All bug reports retrieved successfully', {
      reports: bugReports.map((report) => ({
        id: report.id,
        userId: report.userId,
        description: report.description,
        severity: report.severity,
        status: report.status,
        createdAt: report.createdAt,
      })),
    });
  });

  updateBugReportStatus = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { reportId } = req.params;
    const { status } = req.body;

    const bugReport = await bugReportService.updateBugReportStatus(reportId, status);

    sendSuccessResponse(res, 200, 'Bug report status updated successfully', {
      id: bugReport.id,
      status: bugReport.status,
    });
  });

  updateBugReportSeverity = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { reportId } = req.params;
    const { severity } = req.body;

    const bugReport = await bugReportService.updateBugReportSeverity(reportId, severity);

    sendSuccessResponse(res, 200, 'Bug report severity updated successfully', {
      id: bugReport.id,
      severity: bugReport.severity,
    });
  });

  getBugReportsBySeverity = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { severity } = req.params;
    const bugReports = await bugReportService.getBugReportsBySeverity(
      severity as 'low' | 'medium' | 'high' | 'critical'
    );

    sendSuccessResponse(res, 200, `Bug reports with severity ${severity} retrieved successfully`, {
      reports: bugReports.map((report) => ({
        id: report.id,
        userId: report.userId,
        description: report.description,
        severity: report.severity,
        status: report.status,
        createdAt: report.createdAt,
      })),
    });
  });

  getBugReportsByStatus = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status } = req.params;
    const bugReports = await bugReportService.getBugReportsByStatus(
      status as 'open' | 'in_progress' | 'resolved'
    );

    sendSuccessResponse(res, 200, `Bug reports with status ${status} retrieved successfully`, {
      reports: bugReports.map((report) => ({
        id: report.id,
        userId: report.userId,
        description: report.description,
        severity: report.severity,
        status: report.status,
        createdAt: report.createdAt,
      })),
    });
  });
}

export const reportController = new ReportController();
