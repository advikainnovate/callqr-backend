import { Request, Response } from 'express';
import { reportService } from '../services/report.service';
import { sendSuccessResponse } from '../utils';

export class ReportController {
    async createReport(req: Request, res: Response) {
        const userId = (req as any).user?.userId;
        const reportData = req.body;

        const report = await reportService.createReport(userId, reportData);

        sendSuccessResponse(res, 201, 'Report submitted successfully', {
            report,
        });
    }

    async getMyReports(req: Request, res: Response) {
        const userId = (req as any).user?.userId;
        const reports = await reportService.getUserReports(userId);

        sendSuccessResponse(res, 200, undefined, {
            reports,
        });
    }
}

export const reportController = new ReportController();
