import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { reportService } from '../services/report.service';
import { createReportSchema } from '../schemas/report.schema';
import { logger } from '../utils';

export class ReportController {
    async createReport(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = (req as any).user?.userId;
            const validatedData = createReportSchema.parse(req.body);

            const report = await reportService.createReport(userId, validatedData);

            res.status(201).json({
                success: true,
                message: 'Report submitted successfully',
                data: {
                    report,
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

    async getMyReports(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = (req as any).user?.userId;
            const reports = await reportService.getUserReports(userId);

            res.json({
                success: true,
                data: {
                    reports,
                },
            });
        } catch (error) {
            next(error);
        }
    }
}

export const reportController = new ReportController();
