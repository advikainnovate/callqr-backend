import { db } from '../db';
import { reports, type NewReport, type Report } from '../models';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils';
import { eq, desc } from 'drizzle-orm';

export class ReportService {
    async createReport(userId: string, reportData: Omit<NewReport, 'id' | 'userId'>): Promise<Report> {
        const [report] = await db
            .insert(reports)
            .values({
                ...reportData,
                id: uuidv4(),
                userId,
            })
            .returning();

        logger.info(`Report created: ${report.id} by user ${userId}`);
        return report;
    }

    async getUserReports(userId: string): Promise<Report[]> {
        return db
            .select()
            .from(reports)
            .where(eq(reports.userId, userId))
            .orderBy(desc(reports.createdAt));
    }
}

export const reportService = new ReportService();
