import axios from 'axios';
import { logger } from '../utils/logger';

interface SMSProvider {
  name: string;
  isEnabled: boolean;
  sendSMS(
    to: string,
    message: string,
    dltTemplateId?: string
  ): Promise<boolean>;
}

class ExotelProvider implements SMSProvider {
  name = 'Exotel';
  isEnabled: boolean;
  private accountSid: string;
  private apiKey: string;
  private apiToken: string;
  private subdomain: string;
  private senderId: string;
  private entityId: string;

  constructor() {
    this.accountSid = process.env.EXOTEL_ACCOUNT_SID || '';
    this.apiKey = process.env.EXOTEL_API_KEY || '';
    this.apiToken = process.env.EXOTEL_API_TOKEN || '';
    this.subdomain = process.env.EXOTEL_SUBDOMAIN || 'api.exotel.com';
    this.senderId = process.env.EXOTEL_SENDER_ID || '';
    this.entityId = process.env.EXOTEL_DLT_ENTITY_ID || '';
    const exotelEnabled = process.env.EXOTEL_ENABLED === 'true';

    this.isEnabled = !!(
      exotelEnabled &&
      this.accountSid &&
      this.apiKey &&
      this.apiToken &&
      this.senderId
    );

    if (this.isEnabled) {
      logger.info('Exotel SMS provider initialized');
    }
  }

  async sendSMS(
    to: string,
    message: string,
    dltTemplateId?: string
  ): Promise<boolean> {
    if (!this.isEnabled) return false;
    try {
      const url = `https://${this.apiKey}:${this.apiToken}@${this.subdomain}/v1/Accounts/${this.accountSid}/Sms/send.json`;

      const payload: any = {
        From: this.senderId,
        To: to,
        Body: message,
        Priority: 'high',
      };

      if (this.entityId) payload.DltEntityId = this.entityId;
      if (dltTemplateId) payload.DltTemplateId = dltTemplateId;

      const response = await axios.post(
        url,
        new URLSearchParams(payload).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      logger.info(
        `Exotel SMS sent successfully to ${to}, Status: ${response.status}`
      );
      return true;
    } catch (error: any) {
      logger.error(
        'Exotel failed to send SMS:',
        error.response ? error.response.data : error.message
      );
      return false;
    }
  }
}

class SMSService {
  private exotel: ExotelProvider;

  constructor() {
    this.exotel = new ExotelProvider();

    if (!this.exotel.isEnabled) {
      logger.warn(
        'Exotel SMS provider is disabled or not configured - SMS will be logged to console only'
      );
    }
  }

  async sendOTP(phoneNumber: string, otp: string): Promise<boolean> {
    // Note: This message MUST match the DLT template exactly for Exotel
    const message = `Your verification code is: ${otp}. This code will expire in 10 minutes.`;
    const dltTemplateId = process.env.EXOTEL_DLT_OTP_TEMPLATE_ID;

    return this.routeSMS(phoneNumber, message, dltTemplateId);
  }

  async sendMessage(phoneNumber: string, message: string): Promise<boolean> {
    return this.routeSMS(phoneNumber, message);
  }

  private async routeSMS(
    phoneNumber: string,
    message: string,
    dltTemplateId?: string
  ): Promise<boolean> {
    if (!this.exotel.isEnabled) {
      // Development mode
      logger.info(`[DEV MODE] SMS to ${phoneNumber}: ${message}`);
      return true;
    }

    logger.info(`Routing SMS to ${phoneNumber} via Exotel...`);
    const success = await this.exotel.sendSMS(
      phoneNumber,
      message,
      dltTemplateId
    );

    if (!success) {
      logger.error('Exotel failed to send message');
      throw new Error('Failed to send verification code');
    }

    return true;
  }
}

export const smsService = new SMSService();
