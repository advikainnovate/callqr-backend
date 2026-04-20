import { eq, and, isNull, lt, or, desc } from 'drizzle-orm';
import { db } from '../db';
import { qrCodes, type NewQRCode, type QRCode as QRCodeType } from '../models';
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
  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
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

  async createQRCode(): Promise<QRCodeType> {
    const token = this.generateSecureToken();
    const humanToken = await this.ensureUniqueHumanToken();

    const [qrCode] = await db
      .insert(qrCodes)
      .values({
        id: uuidv4(),
        token,
        humanToken,
        status: 'unassigned',
      })
      .returning();

    logger.info(`QR code created: ${qrCode.id} (${qrCode.humanToken})`);
    return qrCode;
  }

  async bulkCreateQRCodes(count: number): Promise<QRCodeType[]> {
    if (count < 1 || count > 2000) {
      throw new BadRequestError('Count must be between 1 and 2000');
    }

    const qrCodes: QRCodeType[] = [];

    for (let i = 0; i < count; i++) {
      const qrCode = await this.createQRCode();
      qrCodes.push(qrCode);
    }

    logger.info(`Bulk created ${count} QR codes`);
    return qrCodes;
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
