import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db';
import ApiError from '../utils/ApiError';
import { qrCodes, type NewQRCode, type QRCode as QRCodeType } from '../models';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils';
import crypto from 'crypto';
import * as QRCode from 'qrcode';

export class QRCodeService {
  private generateSecureToken(): string {
    // Generate a cryptographically secure random token
    return crypto.randomBytes(32).toString('hex');
  }

  async createQRCode(userId: string, expiresAt?: Date): Promise<QRCodeType> {
    try {
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
    } catch (error: any) {
      logger.error('Error creating QR code:', error);
      throw new ApiError(`Error creating QR code: ${error.message}`, 500);
    }
  }

  async generateQRCodeDataURL(token: string): Promise<string> {
    try {
      // Create the URL that will be encoded in the QR code
      const qrUrl = `${process.env.APP_BASE_URL || 'http://localhost:4000'}/scan/${token}`;

      // Generate QR code as data URL
      const dataURL = await QRCode.toDataURL(qrUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      return dataURL;
    } catch (error: any) {
      logger.error('Error generating QR code data URL:', error);
      throw new ApiError(
        `Error generating QR code data URL: ${error.message}`,
        500
      );
    }
  }

  async getQRCodeByToken(token: string): Promise<QRCodeType | null> {
    try {
      const [qrCode] = await db
        .select()
        .from(qrCodes)
        .where(eq(qrCodes.token, token))
        .limit(1);

      return qrCode || null;
    } catch (error: any) {
      logger.error('Error fetching QR code by token:', error);
      throw new ApiError(
        `Error fetching QR code by token: ${error.message}`,
        500
      );
    }
  }

  async getUserQRCodes(userId: string): Promise<QRCodeType[]> {
    try {
      const userQRCodes = await db
        .select()
        .from(qrCodes)
        .where(eq(qrCodes.userId, userId));

      return userQRCodes;
    } catch (error: any) {
      logger.error('Error fetching user QR codes:', error);
      throw new ApiError(`Error fetching user QR codes: ${error.message}`, 500);
    }
  }

  async updateScanCount(token: string): Promise<QRCodeType | null> {
    try {
      const [qrCode] = await db
        .update(qrCodes)
        .set({
          scanCount: sql`${qrCodes.scanCount} + 1`,
          lastScannedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(qrCodes.token, token))
        .returning();

      return qrCode || null;
    } catch (error: any) {
      logger.error('Error updating scan count:', error);
      throw new ApiError(`Error updating scan count: ${error.message}`, 500);
    }
  }

  async revokeQRCode(qrCodeId: string, userId: string): Promise<boolean> {
    try {
      const [qrCode] = await db
        .update(qrCodes)
        .set({
          isRevoked: true,
          updatedAt: new Date(),
        })
        .where(and(eq(qrCodes.id, qrCodeId), eq(qrCodes.userId, userId)))
        .returning();

      return !!qrCode;
    } catch (error: any) {
      logger.error('Error revoking QR code:', error);
      throw new ApiError(`Error revoking QR code: ${error.message}`, 500);
    }
  }

  async validateQRCode(token: string): Promise<QRCodeType | null> {
    try {
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

      // Check if QR code has expired
      if (qrCode && qrCode.expiresAt && qrCode.expiresAt < new Date()) {
        return null;
      }

      return qrCode || null;
    } catch (error: any) {
      logger.error('Error validating QR code:', error);
      throw new ApiError(`Error validating QR code: ${error.message}`, 500);
    }
  }
}

export const qrCodeService = new QRCodeService();
