import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db';
import { qrCodes, type NewQRCode, type QRCode as QRCodeType } from '../models';
import { v4 as uuidv4 } from 'uuid';
import { logger, NotFoundError, BadRequestError, ConflictError } from '../utils';
import { validateStatusTransition, QR_STATUS_TRANSITIONS } from '../utils/statusTransitions';
import crypto from 'crypto';
import * as QRCode from 'qrcode';
import { userService } from './user.service';

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

  async createQRCode(expiryDays?: number): Promise<QRCodeType> {
    const token = this.generateSecureToken();
    const humanToken = await this.ensureUniqueHumanToken();

    // Calculate expiration if specified
    let expiresAt: Date | null = null;
    if (expiryDays && expiryDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiryDays);
    }

    const [qrCode] = await db
      .insert(qrCodes)
      .values({
        id: uuidv4(),
        token,
        humanToken,
        status: 'unassigned',
        expiresAt,
      })
      .returning();

    logger.info(`QR code created: ${qrCode.id} (${qrCode.humanToken})`, { expiresAt });
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

  async claimQRCode(userId: string, token?: string, humanToken?: string): Promise<QRCodeType> {
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
      const [found] = await db
        .select()
        .from(qrCodes)
        .where(eq(qrCodes.token, token))
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

  async scanQRCode(token?: string, humanToken?: string): Promise<{ qrCode: QRCodeType; user: any }> {
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

    logger.info(`QR code scanned: ${qrCode.humanToken} (owner: ${qrCode.assignedUserId})`);

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

  async disableQRCode(qrCodeId: string, userId: string): Promise<QRCodeType> {
    const qrCode = await this.getQRCodeById(qrCodeId);
    
    // Validate ownership
    if (qrCode.assignedUserId !== userId) {
      throw new BadRequestError('You do not have permission to disable this QR code');
    }

    // Validate status transition
    validateStatusTransition(qrCode.status, 'disabled', QR_STATUS_TRANSITIONS, 'QR Code');

    const [updatedQR] = await db
      .update(qrCodes)
      .set({ status: 'disabled' })
      .where(eq(qrCodes.id, qrCodeId))
      .returning();

    logger.info(`QR code disabled: ${qrCodeId}`);
    return updatedQR;
  }

  async reactivateQRCode(qrCodeId: string, userId: string): Promise<QRCodeType> {
    const qrCode = await this.getQRCodeById(qrCodeId);
    
    // Validate ownership
    if (qrCode.assignedUserId !== userId) {
      throw new BadRequestError('You do not have permission to reactivate this QR code');
    }

    // Validate status transition
    validateStatusTransition(qrCode.status, 'active', QR_STATUS_TRANSITIONS, 'QR Code');

    const [updatedQR] = await db
      .update(qrCodes)
      .set({ status: 'active' })
      .where(eq(qrCodes.id, qrCodeId))
      .returning();

    logger.info(`QR code reactivated: ${qrCodeId}`);
    return updatedQR;
  }

  async revokeQRCode(qrCodeId: string, userId: string): Promise<QRCodeType> {
    const qrCode = await this.getQRCodeById(qrCodeId);
    
    // Validate ownership
    if (qrCode.assignedUserId !== userId) {
      throw new BadRequestError('You do not have permission to revoke this QR code');
    }

    // Validate status transition
    validateStatusTransition(qrCode.status, 'revoked', QR_STATUS_TRANSITIONS, 'QR Code');

    const [updatedQR] = await db
      .update(qrCodes)
      .set({ status: 'revoked' })
      .where(eq(qrCodes.id, qrCodeId))
      .returning();

    logger.info(`QR code revoked: ${qrCodeId}`);
    return updatedQR;
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

    // Check if QR code has expired
    if (qrCode.expiresAt && qrCode.expiresAt < new Date()) {
      throw new BadRequestError('QR code has expired');
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
