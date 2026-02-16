import nodemailer, { Transporter } from 'nodemailer';
import { appConfig } from '../config';
import { currentEnv } from '../config/environments';
import { logger } from '../utils';

export class EmailService {
  private transporter: Transporter | null = null;

  constructor() {
    if (currentEnv.email.enabled && this.isConfigured()) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      });
    }
  }

  private isConfigured(): boolean {
    return !!(
      process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD &&
      process.env.FROM_EMAIL
    );
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    if (!this.transporter) {
      logger.warn('Email service not configured, skipping email send');
      return;
    }

    try {
      await this.transporter.sendMail({
        from: process.env.FROM_EMAIL,
        to,
        subject,
        html,
      });
      logger.info(`Email sent to ${to}: ${subject}`);
    } catch (error) {
      logger.error('Failed to send email', { error, to, subject });
      throw error;
    }
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const verificationUrl = `${process.env.APP_URL || 'http://localhost:4000'}/api/auth/verify-email?token=${token}`;
    
    const html = `
      <h1>Email Verification</h1>
      <p>Please click the link below to verify your email address:</p>
      <a href="${verificationUrl}">${verificationUrl}</a>
      <p>This link will expire in 24 hours.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `;

    await this.sendEmail(email, 'Verify Your Email', html);
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${process.env.APP_URL || 'http://localhost:4000'}/reset-password?token=${token}`;
    
    const html = `
      <h1>Password Reset Request</h1>
      <p>You requested to reset your password. Click the link below to proceed:</p>
      <a href="${resetUrl}">${resetUrl}</a>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email and your password will remain unchanged.</p>
    `;

    await this.sendEmail(email, 'Reset Your Password', html);
  }

  async sendWelcomeEmail(email: string, username: string): Promise<void> {
    const html = `
      <h1>Welcome to Our Platform!</h1>
      <p>Hi ${username},</p>
      <p>Thank you for joining us. We're excited to have you on board!</p>
      <p>If you have any questions, feel free to reach out to our support team.</p>
    `;

    await this.sendEmail(email, 'Welcome!', html);
  }
}

export const emailService = new EmailService();
