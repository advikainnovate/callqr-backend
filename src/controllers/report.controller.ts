import { Request, Response } from 'express';
import { reportService } from '../services/report.service';
import { sendSuccessResponse, UnauthorizedError } from '../utils';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export class ReportController {
    async createReport(req: Request, res: Response) {
        const userId = (req as AuthenticatedRequest).user?.userId;
        if (!userId) throw new UnauthorizedError();

        const report = await reportService.createReport(userId, req.body);

        sendSuccessResponse(res, 201, 'Report submitted successfully', { report });
    }

    async getMyReports(req: Request, res: Response) {
        const userId = (req as AuthenticatedRequest).user?.userId;
        if (!userId) throw new UnauthorizedError();

        const reports = await reportService.getUserReports(userId);

        sendSuccessResponse(res, 200, undefined, { reports });
    }
}

export const reportController = new ReportController();
