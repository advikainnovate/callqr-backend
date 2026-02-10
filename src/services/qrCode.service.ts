import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db';
import { qrCodes, type NewQRCode, type QRCode as QRCodeType } from '../models';
import { v4 as uuidv4 } from 'uuid';
import { logger, NotFoundError, BadRequestError, ConflictError } from '../utils';
import crypto from 'crypto';
import * as QRCode from 'qrcode';
import { userService } from './user.service';

export class QRCodeService {
  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  async createQRCode(): Promise<QRCodeType> {
    const token = this.generateSecureToken();

    const [qrCode] = await db
      .insert(qrCodes)
      .values({
        id: uuidv4(),
        token,
        status: 'unassigned',
      })
      .returning();

    logger.info(`QR code created: ${qrCode.id}`);
    return qrCode;
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
    return db
      .select()
      .from(qrCodes)
      .where(eq(qrCodes.assignedUserId, userId));
  }

  async getUnassignedQRCodes(limit: number = 100): Promise<QRCodeType[]> {
    return db
      .select()
      .from(qrCodes)
      .where(eq(qrCodes.status, 'unassigned'))
      .limit(limit);
  }

  async scanQRCode(token: string): Promise<{ qrCode: QRCodeType; user: any }> {
    const qrCode = await this.validateQRCode(token);

    if (!qrCode.assignedUserId) {
      throw new BadRequestError('QR code is not assigned to any user');
    }

    // Get user profile for this QR code
    const user = await userService.getUserById(qrCode.assignedUserId);
    if (user.status !== 'active') {
      throw new BadRequestError('QR code owner is not active');
    }

    logger.info(`QR code scanned: ${qrCode.id} by user ${qrCode.assignedUserId}`);

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
      throw new NotFoundError('QR code not found or you do not have permission to revoke it');
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
      throw new NotFoundError('QR code not found or you do not have permission to disable it');
    }

    logger.info(`QR code disabled: ${qrCodeId}`);
    return qrCode;
  }

  async reactivateQRCode(qrCodeId: string, userId: string): Promise<QRCodeType> {
    const [qrCode] = await db
      .update(qrCodes)
      .set({
        status: 'active',
      })
      .where(and(eq(qrCodes.id, qrCodeId), eq(qrCodes.assignedUserId, userId)))
      .returning();

    if (!qrCode) {
      throw new NotFoundError('QR code not found or you do not have permission to reactivate it');
    }

    logger.info(`QR code reactivated: ${qrCodeId}`);
    return qrCode;
  }

  async validateQRCode(token: string): Promise<QRCodeType> {
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

  async generateQRCodeImage(token: string): Promise<string> {
    const qrUrl = `${process.env.APP_BASE_URL || 'http://localhost:4000'}/scan/${token}`;

    const dataURL = await QRCode.toDataURL(qrUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    });

    return dataURL;
  }
}

export const qrCodeService = new QRCodeService();
