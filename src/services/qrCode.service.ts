import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db';
import { qrCodes, type NewQRCode, type QRCode as QRCodeType } from '../models';
import { v4 as uuidv4 } from 'uuid';
import { logger, NotFoundError, UnauthorizedError } from '../utils';
import crypto from 'crypto';
import * as QRCode from 'qrcode';
import { userService } from './user.service';

export class QRCodeService {
  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  async createQRCode(userId: string, expiresAt?: Date): Promise<QRCodeType> {
    // Check if the user already has an active, non-revoked QR code
    const [existingQRCode] = await db
      .select()
      .from(qrCodes)
      .where(
        and(
          eq(qrCodes.userId, userId),
          eq(qrCodes.isActive, true),
          eq(qrCodes.isRevoked, false)
        )
      )
      .limit(1);

    if (existingQRCode) {
      logger.info(`Returning existing active QR code for user: ${userId}`);
      return existingQRCode;
    }

    const token = this.generateSecureToken();

    const [qrCode] = await db
      .insert(qrCodes)
      .values({
        id: uuidv4(),
        userId,
        token,
        expiresAt: expiresAt || null,
      })
      .returning();

    logger.info(`QR code created for user: ${userId}`);
    return qrCode;
  }

  async generateQRCodeDataURL(token: string): Promise<string> {
    const qrUrl = `${process.env.APP_BASE_URL || 'http://localhost:4000'}/scan/${token}`;

    const dataURL = await QRCode.toDataURL(qrUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    });

    return dataURL;
  }

  async getQRCodeByToken(token: string): Promise<QRCodeType> {
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

  async getUserQRCodes(userId: string): Promise<QRCodeType[]> {
    return db
      .select()
      .from(qrCodes)
      .where(eq(qrCodes.userId, userId));
  }

  async scanQRCode(token: string): Promise<{ qrCode: QRCodeType; user: any }> {
    const qrCode = await this.validateQRCode(token);

    // Get user profile for this QR code
    const user = await userService.getUserById(qrCode.userId);
    if (!user.isActive) {
      throw new NotFoundError('QR code owner is inactive');
    }

    // Update scan count
    await db
      .update(qrCodes)
      .set({
        scanCount: sql`${qrCodes.scanCount} + 1`,
        lastScannedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(qrCodes.token, token));

    return { qrCode, user };
  }

  async revokeQRCode(qrCodeId: string, userId: string): Promise<void> {
    const [qrCode] = await db
      .update(qrCodes)
      .set({
        isRevoked: true,
        updatedAt: new Date(),
      })
      .where(and(eq(qrCodes.id, qrCodeId), eq(qrCodes.userId, userId)))
      .returning();

    if (!qrCode) {
      throw new NotFoundError('QR code not found or you do not have permission to revoke it');
    }
  }

  async validateQRCode(token: string): Promise<QRCodeType> {
    const [qrCode] = await db
      .select()
      .from(qrCodes)
      .where(
        and(
          eq(qrCodes.token, token),
          eq(qrCodes.isActive, true),
          eq(qrCodes.isRevoked, false)
        )
      )
      .limit(1);

    if (!qrCode) {
      throw new NotFoundError('Invalid or expired QR code');
    }

    if (qrCode.expiresAt && qrCode.expiresAt < new Date()) {
      throw new NotFoundError('QR code has expired');
    }

    return qrCode;
  }
}

export const qrCodeService = new QRCodeService();
