import nodemailer from 'nodemailer';
import { appConfig } from '../config';
import { logger } from '../utils';

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private isEnabled: boolean;

  constructor() {
    const { host, port, user, password, fromEmail } = appConfig.email;
    this.isEnabled = Boolean(host && port && user && password && fromEmail);

    if (this.isEnabled) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
          user,
          pass: password,
        },
      });
      logger.info('SMTP email service initialized');
    } else {
      logger.warn(
        'SMTP email service is not configured - emails will be logged to console only'
      );
    }
  }

  async sendVerificationOTP(to: string, otp: string): Promise<void> {
    const subject = 'Verify your CallQR email';
    const text = `Your CallQR email verification code is ${otp}. It expires in 10 minutes.`;

    await this.sendMail(to, subject, text);
  }

  async sendPasswordResetOTP(to: string, otp: string): Promise<void> {
    const subject = 'Reset your CallQR password';
    const text = `Your CallQR password reset code is ${otp}. It expires in 10 minutes.`;

    await this.sendMail(to, subject, text);
  }

  private async sendMail(
    to: string,
    subject: string,
    text: string
  ): Promise<void> {
    if (!this.isEnabled || !this.transporter) {
      logger.info(`[DEV MODE] Email to ${to}: ${subject} - ${text}`);
      return;
    }

    await this.transporter.sendMail({
      from: appConfig.email.fromEmail,
      to,
      subject,
      text,
    });
  }
}

export const emailService = new EmailService();
