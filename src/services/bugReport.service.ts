import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { bugReports, type NewBugReport, type BugReport } from '../models';
import { v4 as uuidv4 } from 'uuid';
import { logger, NotFoundError } from '../utils';

export class BugReportService {
  async createBugReport(
    description: string,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    userId?: string
  ): Promise<BugReport> {
    const [bugReport] = await db
      .insert(bugReports)
      .values({
        id: uuidv4(),
        userId: userId || null,
        description,
        severity,
        status: 'open',
      })
      .returning();

    logger.info(`Bug report created: ${bugReport.id} ${userId ? `by user ${userId}` : '(anonymous)'}`);
    return bugReport;
  }

  async getBugReportById(reportId: string): Promise<BugReport> {
    const [bugReport] = await db
      .select()
      .from(bugReports)
      .where(eq(bugReports.id, reportId))
      .limit(1);

    if (!bugReport) {
      throw new NotFoundError('Bug report not found');
    }

    return bugReport;
  }

  async getUserBugReports(userId: string, limit: number = 50): Promise<BugReport[]> {
    return db
      .select()
      .from(bugReports)
      .where(eq(bugReports.userId, userId))
      .orderBy(desc(bugReports.createdAt))
      .limit(limit);
  }

  async getAllBugReports(limit: number = 100): Promise<BugReport[]> {
    return db
      .select()
      .from(bugReports)
      .orderBy(desc(bugReports.createdAt))
      .limit(limit);
  }

  async updateBugReportStatus(
    reportId: string,
    status: 'open' | 'in_progress' | 'resolved'
  ): Promise<BugReport> {
    const [bugReport] = await db
      .update(bugReports)
      .set({ status })
      .where(eq(bugReports.id, reportId))
      .returning();

    if (!bugReport) {
      throw new NotFoundError('Bug report not found');
    }

    logger.info(`Bug report ${reportId} status updated to: ${status}`);
    return bugReport;
  }

  async updateBugReportSeverity(
    reportId: string,
    severity: 'low' | 'medium' | 'high' | 'critical'
  ): Promise<BugReport> {
    const [bugReport] = await db
      .update(bugReports)
      .set({ severity })
      .where(eq(bugReports.id, reportId))
      .returning();

    if (!bugReport) {
      throw new NotFoundError('Bug report not found');
    }

    logger.info(`Bug report ${reportId} severity updated to: ${severity}`);
    return bugReport;
  }

  async getBugReportsBySeverity(severity: 'low' | 'medium' | 'high' | 'critical'): Promise<BugReport[]> {
    return db
      .select()
      .from(bugReports)
      .where(eq(bugReports.severity, severity))
      .orderBy(desc(bugReports.createdAt));
  }

  async getBugReportsByStatus(status: 'open' | 'in_progress' | 'resolved'): Promise<BugReport[]> {
    return db
      .select()
      .from(bugReports)
      .where(eq(bugReports.status, status))
      .orderBy(desc(bugReports.createdAt));
  }
}

export const bugReportService = new BugReportService();
