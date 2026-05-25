import { eq, and, lt, or, desc, sql, count, gte } from 'drizzle-orm';
import { db } from '../db';
import {
  qrCodes,
  qrBatches,
  type QRCode as QRCodeType,
  type QRBatch,
} from '../models';
import { v4 as uuidv4 } from 'uuid';
import {
  logger,
  NotFoundError,
  BadRequestError,
  ConflictError,
} from '../utils';
import crypto from 'crypto';
import * as QRCode from 'qrcode';
import { userService } from './user.service';
import { appConfig } from '../config';
import { extractQRCodeToken } from '../utils/tokenUtils';

export class QRCodeService {
  private readonly allowedBatchCounts = [10, 25, 50, 100, 200, 500, 1000];

  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private getInitialBatchStatus(purpose: 'printing' | 'digital'): string {
    return 'generated';
  }

  private getBatchTypeCode(purpose: 'printing' | 'digital'): 'PR' | 'DG' {
    return purpose === 'printing' ? 'PR' : 'DG';
  }

  private formatBatchDateParts(date: Date): {
    dayKey: string;
    displayDate: string;
  } {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);

    return {
      dayKey: `${date.getFullYear()}-${month}-${day}`,
      displayDate: `${day}${month}${year}`,
    };
  }

  private async generateBatchNumber(
    purpose: 'printing' | 'digital',
    date: Date
  ): Promise<string> {
    const typeCode = this.getBatchTypeCode(purpose);
    const { dayKey, displayDate } = this.formatBatchDateParts(date);
    const startOfDay = new Date(`${dayKey}T00:00:00.000`);
    const nextDayStart = new Date(startOfDay);
    nextDayStart.setDate(nextDayStart.getDate() + 1);

    const rows = await db
      .select({
        batchNumber: qrBatches.batchNumber,
      })
      .from(qrBatches)
      .where(
        and(
          gte(qrBatches.createdAt, startOfDay),
          lt(qrBatches.createdAt, nextDayStart)
        )
      )
      .orderBy(desc(qrBatches.createdAt));

    let maxSequence = 0;
    for (const row of rows) {
      const match = row.batchNumber.match(/-(\d{3})$/);
      if (!match) continue;
      const sequence = parseInt(match[1], 10);
      if (sequence > maxSequence) {
        maxSequence = sequence;
      }
    }

    return `${typeCode}-${displayDate}-${String(maxSequence + 1).padStart(3, '0')}`;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }

  private async createBatchRecord(input: {
    count: number;
    purpose: 'printing' | 'digital';
    createdBy?: string;
    notes?: string;
    printJobRef?: string;
  }): Promise<QRBatch> {
    const { count, purpose, createdBy, notes, printJobRef } = input;

    for (let attempt = 0; attempt < 10; attempt++) {
      const now = new Date();
      const batchNumber = await this.generateBatchNumber(purpose, now);

      try {
        const [batch] = await db
          .insert(qrBatches)
          .values({
            id: uuidv4(),
            batchNumber,
            purpose,
            status: this.getInitialBatchStatus(purpose),
            quantity: count,
            createdBy: createdBy || null,
            notes: notes?.trim() || null,
            printJobRef: printJobRef?.trim() || null,
          })
          .returning();

        return batch;
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          continue;
        }

        throw error;
      }
    }

    throw new Error('Failed to generate a unique batch number');
  }

  private generateHumanToken(): string {
    // Character set excluding confusing characters (0, O, 1, I, L)
    const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    let token = 'QR-';

    // Generate first group (4 chars)
    for (let i = 0; i < 4; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    token += '-';

    // Generate second group (4 chars)
    for (let i = 0; i < 4; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return token;
  }

  private async ensureUniqueHumanToken(): Promise<string> {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const humanToken = this.generateHumanToken();

      // Check if token already exists
      const [existing] = await db
        .select()
        .from(qrCodes)
        .where(eq(qrCodes.humanToken, humanToken))
        .limit(1);

      if (!existing) {
        return humanToken;
      }

      attempts++;
    }

    throw new Error('Failed to generate unique human token');
  }

  private async createQRCodeRecord(
    batchId?: string | null
  ): Promise<QRCodeType> {
    const token = this.generateSecureToken();
    const humanToken = await this.ensureUniqueHumanToken();

    const [qrCode] = await db
      .insert(qrCodes)
      .values({
        id: uuidv4(),
        token,
        humanToken,
        batchId: batchId || null,
        status: 'unassigned',
      })
      .returning();

    logger.info(`QR code created: ${qrCode.id} (${qrCode.humanToken})`);
    return qrCode;
  }

  async createQRCode(): Promise<QRCodeType> {
    return this.createQRCodeRecord();
  }

  async createQRCodeBatch(input: {
    count: number;
    purpose: 'printing' | 'digital';
    createdBy?: string;
    notes?: string;
    printJobRef?: string;
  }): Promise<{ batch: QRBatch; qrCodes: QRCodeType[] }> {
    const { count, purpose, createdBy, notes, printJobRef } = input;
    if (!this.allowedBatchCounts.includes(count)) {
      throw new BadRequestError(
        `Count must be one of: ${this.allowedBatchCounts.join(', ')}`
      );
    }

    const batch = await this.createBatchRecord({
      count,
      purpose,
      createdBy,
      notes,
      printJobRef,
    });

    const createdQRCodes: QRCodeType[] = [];
    for (let i = 0; i < count; i++) {
      createdQRCodes.push(await this.createQRCodeRecord(batch.id));
    }

    logger.info(
      `Created QR batch ${batch.batchNumber} with ${count} codes for ${purpose}`
    );

    return {
      batch,
      qrCodes: createdQRCodes,
    };
  }

  async bulkCreateQRCodes(count: number): Promise<QRCodeType[]> {
    const result = await this.createQRCodeBatch({
      count,
      purpose: 'digital',
    });
    return result.qrCodes;
  }

  async updateBatchStatus(
    batchId: string,
    status: string,
    options?: { printJobRef?: string; notes?: string }
  ): Promise<QRBatch> {
    const [existingBatch] = await db
      .select()
      .from(qrBatches)
      .where(eq(qrBatches.id, batchId))
      .limit(1);

    if (!existingBatch) {
      throw new NotFoundError('QR batch not found');
    }

    if (existingBatch.purpose !== 'printing') {
      throw new BadRequestError(
        'Digital batch status is managed automatically by assignment state'
      );
    }

    const allowedTransitions: Record<string, string[]> = {
      generated: ['generated', 'print_pending'],
      print_pending: ['print_pending', 'printed'],
      printed: ['printed', 'distributed'],
      distributed: ['distributed'],
    };

    const allowedStatuses = allowedTransitions[existingBatch.status] || [
      existingBatch.status,
    ];

    if (!allowedStatuses.includes(status)) {
      throw new BadRequestError(
        `Invalid batch status transition from ${existingBatch.status} to ${status}`
      );
    }

    const [updatedBatch] = await db
      .update(qrBatches)
      .set({
        status,
        printJobRef: options?.printJobRef?.trim() || existingBatch.printJobRef,
        notes: options?.notes?.trim() || existingBatch.notes,
        distributedAt: status === 'distributed' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(qrBatches.id, batchId))
      .returning();

    return updatedBatch;
  }

  async getBatchById(batchId: string): Promise<QRBatch> {
    const [batch] = await db
      .select()
      .from(qrBatches)
      .where(eq(qrBatches.id, batchId))
      .limit(1);

    if (!batch) {
      throw new NotFoundError('QR batch not found');
    }

    return batch;
  }

  async refreshDigitalBatchStatus(batchId?: string | null): Promise<void> {
    if (!batchId) return;

    const [batch] = await db
      .select()
      .from(qrBatches)
      .where(eq(qrBatches.id, batchId))
      .limit(1);

    if (!batch || batch.purpose !== 'digital') {
      return;
    }

    const [summary] = await db
      .select({
        total: count(qrCodes.id),
        assigned: sql<number>`count(case when ${qrCodes.assignedUserId} is not null then 1 end)`,
      })
      .from(qrCodes)
      .where(eq(qrCodes.batchId, batchId));

    const total = Number(summary.total || 0);
    const assigned = Number(summary.assigned || 0);

    let nextStatus = 'generated';
    if (assigned === 0 && total > 0) {
      nextStatus = 'available';
    } else if (assigned > 0 && assigned < total) {
      nextStatus = 'partially_assigned';
    } else if (total > 0 && assigned === total) {
      nextStatus = 'fully_assigned';
    }

    if (nextStatus !== batch.status) {
      await db
        .update(qrBatches)
        .set({
          status: nextStatus,
          updatedAt: new Date(),
        })
        .where(eq(qrBatches.id, batchId));
    }
  }

  async claimQRCode(
    userId: string,
    token?: string,
    humanToken?: string
  ): Promise<QRCodeType> {
    if (!token && !humanToken) {
      throw new BadRequestError('Either token or humanToken must be provided');
    }

    // Verify user exists and is active
    const user = await userService.getUserById(userId);
    if (user.status !== 'active') {
      throw new BadRequestError('Cannot claim QR code with inactive account');
    }

    // Find QR code by token or humanToken
    let qrCode: QRCodeType | undefined;

    if (humanToken) {
      const normalizedHumanToken = humanToken.toUpperCase().trim();
      const [found] = await db
        .select()
        .from(qrCodes)
        .where(eq(qrCodes.humanToken, normalizedHumanToken))
        .limit(1);
      qrCode = found;
    } else if (token) {
      const extractedToken = extractQRCodeToken(token);
      if (!extractedToken) {
        throw new BadRequestError('Invalid QR token format');
      }

      const [found] = await db
        .select()
        .from(qrCodes)
        .where(eq(qrCodes.token, extractedToken))
        .limit(1);
      qrCode = found;
    }

    if (!qrCode) {
      throw new NotFoundError('QR code not found');
    }

    if (qrCode.status !== 'unassigned') {
      throw new BadRequestError('QR code is already claimed or not available');
    }

    // Business Rule: A user can only have 1 active/disabled QR code at a time
    const existingQRs = await this.getUserQRCodes(userId);
    const hasActiveOrDisabled = existingQRs.some(
      qr => qr.status === 'active' || qr.status === 'disabled'
    );
    if (hasActiveOrDisabled) {
      throw new BadRequestError(
        'You already have an active or disabled QR code. Please revoke it before claiming a new one.'
      );
    }

    // Claim the QR code
    const [claimedQR] = await db
      .update(qrCodes)
      .set({
        assignedUserId: userId,
        status: 'active',
        assignedAt: new Date(),
      })
      .where(eq(qrCodes.id, qrCode.id))
      .returning();

    await this.refreshDigitalBatchStatus(claimedQR.batchId);

    logger.info(`QR code ${qrCode.humanToken} claimed by user ${userId}`);
    return claimedQR;
  }

  async assignQRCode(qrCodeId: string, userId: string): Promise<QRCodeType> {
    // Verify user exists and is active
    const user = await userService.getUserById(userId);
    if (user.status !== 'active') {
      throw new BadRequestError('Cannot assign QR code to inactive user');
    }

    // Check if QR code exists and is unassigned
    const [existingQR] = await db
      .select()
      .from(qrCodes)
      .where(eq(qrCodes.id, qrCodeId))
      .limit(1);

    if (!existingQR) {
      throw new NotFoundError('QR code not found');
    }

    // Business Rule: A user can only have 1 active/disabled QR code at a time
    const targetUserQRs = await this.getUserQRCodes(userId);
    const hasActiveOrDisabled = targetUserQRs.some(
      qr => qr.status === 'active' || qr.status === 'disabled'
    );
    if (hasActiveOrDisabled) {
      throw new BadRequestError(
        'Target user already has an active or disabled QR code.'
      );
    }

    if (existingQR.status !== 'unassigned') {
      throw new BadRequestError('QR code is already assigned or not available');
    }

    // Assign the QR code
    const [updatedQR] = await db
      .update(qrCodes)
      .set({
        assignedUserId: userId,
        status: 'active',
        assignedAt: new Date(),
      })
      .where(eq(qrCodes.id, qrCodeId))
      .returning();

    await this.refreshDigitalBatchStatus(updatedQR.batchId);

    logger.info(`QR code ${qrCodeId} assigned to user ${userId}`);
    return updatedQR;
  }

  async getQRCodeByToken(input: string): Promise<QRCodeType> {
    const token = extractQRCodeToken(input);

    if (!token) {
      logger.warn(`Invalid QR token input received: ${input}`);
      throw new BadRequestError('Invalid QR token format');
    }

    const [qrCode] = await db
      .select()
      .from(qrCodes)
      .where(eq(qrCodes.token, token))
      .limit(1);

    if (!qrCode) {
      throw new NotFoundError('QR code not found');
    }

    return qrCode;
  }

  async getQRCodeByHumanToken(humanToken: string): Promise<QRCodeType> {
    const normalizedToken = humanToken.toUpperCase().trim();

    const [qrCode] = await db
      .select()
      .from(qrCodes)
      .where(eq(qrCodes.humanToken, normalizedToken))
      .limit(1);

    if (!qrCode) {
      throw new NotFoundError('QR code not found');
    }

    return qrCode;
  }

  async getQRCodeById(qrCodeId: string): Promise<QRCodeType> {
    const [qrCode] = await db
      .select()
      .from(qrCodes)
      .where(eq(qrCodes.id, qrCodeId))
      .limit(1);

    if (!qrCode) {
      throw new NotFoundError('QR code not found');
    }

    return qrCode;
  }

  async getUserQRCodes(userId: string): Promise<QRCodeType[]> {
    return db.select().from(qrCodes).where(eq(qrCodes.assignedUserId, userId));
  }

  async getUnassignedQRCodes(
    limit: number = 50,
    cursor?: string
  ): Promise<{
    data: QRCodeType[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    let whereClause = eq(qrCodes.status, 'unassigned');

    if (cursor) {
      try {
        const decodedCursor = Buffer.from(cursor, 'base64').toString('utf-8');
        const [cursorTime, cursorId] = decodedCursor.split(':');

        if (cursorTime && cursorId) {
          const cursorDate = new Date(cursorTime);
          whereClause = and(
            whereClause,
            or(
              lt(qrCodes.createdAt, cursorDate),
              and(eq(qrCodes.createdAt, cursorDate), lt(qrCodes.id, cursorId))
            )
          ) as any;
        }
      } catch (error) {
        logger.error(`Invalid cursor provided: ${cursor}`);
        // Fallback to no cursor if it's malformed
      }
    }

    const results = await db
      .select()
      .from(qrCodes)
      .where(whereClause)
      .orderBy(desc(qrCodes.createdAt), desc(qrCodes.id))
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    let nextCursor: string | null = null;
    if (hasMore && data.length > 0) {
      const lastItem = data[data.length - 1];
      const cursorStr = `${lastItem.createdAt?.toISOString()}:${lastItem.id}`;
      nextCursor = Buffer.from(cursorStr).toString('base64');
    }

    return {
      data,
      nextCursor,
      hasMore,
    };
  }

  async scanQRCode(
    token?: string,
    humanToken?: string
  ): Promise<{ qrCode: QRCodeType; user: any }> {
    if (!token && !humanToken) {
      throw new BadRequestError('Either token or humanToken must be provided');
    }

    let qrCode: QRCodeType;

    if (humanToken) {
      qrCode = await this.getQRCodeByHumanToken(humanToken);
    } else {
      qrCode = await this.getQRCodeByToken(token!);
    }

    // If QR code is unassigned, return it with status
    if (qrCode.status === 'unassigned') {
      return {
        qrCode: {
          ...qrCode,
          assignedUserId: null,
        },
        user: null,
      };
    }

    // Validate QR code is active
    if (qrCode.status !== 'active') {
      throw new BadRequestError('QR code is not active');
    }

    if (!qrCode.assignedUserId) {
      throw new BadRequestError('QR code is not assigned to any user');
    }

    // Get user profile for this QR code
    const user = await userService.getUserById(qrCode.assignedUserId);
    if (user.status !== 'active') {
      throw new BadRequestError('QR code owner is not active');
    }

    logger.info(
      `QR code scanned: ${qrCode.humanToken} (owner: ${qrCode.assignedUserId})`
    );

    return {
      qrCode,
      user: {
        id: user.id,
        username: user.username,
        status: user.status,
        createdAt: user.createdAt,
      },
    };
  }

  async revokeQRCode(qrCodeId: string, userId: string): Promise<QRCodeType> {
    const [qrCode] = await db
      .update(qrCodes)
      .set({
        status: 'revoked',
      })
      .where(and(eq(qrCodes.id, qrCodeId), eq(qrCodes.assignedUserId, userId)))
      .returning();

    if (!qrCode) {
      throw new NotFoundError(
        'QR code not found or you do not have permission to revoke it'
      );
    }

    logger.info(`QR code revoked: ${qrCodeId}`);
    return qrCode;
  }

  async disableQRCode(qrCodeId: string, userId: string): Promise<QRCodeType> {
    const [qrCode] = await db
      .update(qrCodes)
      .set({
        status: 'disabled',
      })
      .where(and(eq(qrCodes.id, qrCodeId), eq(qrCodes.assignedUserId, userId)))
      .returning();

    if (!qrCode) {
      throw new NotFoundError(
        'QR code not found or you do not have permission to disable it'
      );
    }

    logger.info(`QR code disabled: ${qrCodeId}`);
    return qrCode;
  }

  async reactivateQRCode(
    qrCodeId: string,
    userId: string
  ): Promise<QRCodeType> {
    const [qrCode] = await db
      .update(qrCodes)
      .set({
        status: 'active',
      })
      .where(and(eq(qrCodes.id, qrCodeId), eq(qrCodes.assignedUserId, userId)))
      .returning();

    if (!qrCode) {
      throw new NotFoundError(
        'QR code not found or you do not have permission to reactivate it'
      );
    }

    logger.info(`QR code reactivated: ${qrCodeId}`);
    return qrCode;
  }

  async validateQRCode(input: string): Promise<QRCodeType> {
    const token = extractQRCodeToken(input);

    if (!token) {
      logger.warn(`Invalid QR token validation input received: ${input}`);
      throw new NotFoundError('Invalid, revoked, or disabled QR code');
    }

    const [qrCode] = await db
      .select()
      .from(qrCodes)
      .where(and(eq(qrCodes.token, token), eq(qrCodes.status, 'active')))
      .limit(1);

    if (!qrCode) {
      throw new NotFoundError('Invalid, revoked, or disabled QR code');
    }

    return qrCode;
  }

  async generateQRCodeImage(input: string): Promise<string> {
    const token = extractQRCodeToken(input);

    if (!token) {
      throw new BadRequestError('Invalid QR token format');
    }

    const qrUrl = `${appConfig.backendUrl}/api/qr-codes/resolve/${token}`;

    const dataURL = await QRCode.toDataURL(qrUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    });

    return dataURL;
  }

  async generateQRCodeBuffer(input: string): Promise<Buffer> {
    const token = extractQRCodeToken(input);

    if (!token) {
      throw new BadRequestError('Invalid QR token format');
    }

    const qrUrl = `${appConfig.backendUrl}/api/qr-codes/resolve/${token}`;

    const buffer = await QRCode.toBuffer(qrUrl, {
      type: 'png',
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    });

    return buffer;
  }
}

export const qrCodeService = new QRCodeService();
