import twilio from 'twilio';
import { logger } from '../utils/logger';

class SMSService {
  private client: twilio.Twilio | null = null;
  private fromNumber: string;
  private isEnabled: boolean;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';

    // Check if Twilio is configured
    this.isEnabled = !!(accountSid && authToken && this.fromNumber);

    if (this.isEnabled) {
      this.client = twilio(accountSid, authToken);
      logger.info('Twilio SMS service initialized');
    } else {
      logger.warn(
        'Twilio SMS service not configured - SMS will be logged to console only'
      );
    }
  }

  async sendOTP(phoneNumber: string, otp: string): Promise<boolean> {
    const message = `Your verification code is: ${otp}. This code will expire in 10 minutes.`;

    try {
      if (!this.isEnabled || !this.client) {
        // Development mode - log OTP to console
        logger.info(`[DEV MODE] SMS to ${phoneNumber}: ${message}`);
        logger.info(`📱 SMS OTP for ${phoneNumber}: ${otp}`);
        return true;
      }

      // Production mode - send via Twilio
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: phoneNumber,
      });

      logger.info(
        `SMS sent successfully to ${phoneNumber}, SID: ${result.sid}`
      );
      return true;
    } catch (error) {
      logger.error('Failed to send SMS:', error);
      throw new Error('Failed to send verification code');
    }
  }

  async sendMessage(phoneNumber: string, message: string): Promise<boolean> {
    try {
      if (!this.isEnabled || !this.client) {
        logger.info(`[DEV MODE] SMS to ${phoneNumber}: ${message}`);
        return true;
      }

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: phoneNumber,
      });

      logger.info(
        `SMS sent successfully to ${phoneNumber}, SID: ${result.sid}`
      );
      return true;
    } catch (error) {
      logger.error('Failed to send SMS:', error);
      throw new Error('Failed to send SMS');
    }
  }
}

export const smsService = new SMSService();
