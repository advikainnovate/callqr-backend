import twilio from 'twilio';
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

class TwilioProvider implements SMSProvider {
  name = 'Twilio';
  isEnabled: boolean;
  private client: twilio.Twilio | null = null;
  private fromNumber: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';
    this.isEnabled = !!(accountSid && authToken && this.fromNumber);

    if (this.isEnabled) {
      this.client = twilio(accountSid, authToken);
      logger.info('Twilio SMS provider initialized');
    }
  }

  async sendSMS(to: string, message: string): Promise<boolean> {
    if (!this.isEnabled || !this.client) return false;
    try {
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: to,
      });
      logger.info(`Twilio SMS sent successfully to ${to}, SID: ${result.sid}`);
      return true;
    } catch (error) {
      logger.error('Twilio failed to send SMS:', error);
      return false;
    }
  }
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

    this.isEnabled = !!(
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
  private twilio: TwilioProvider;
  private exotel: ExotelProvider;

  constructor() {
    this.twilio = new TwilioProvider();
    this.exotel = new ExotelProvider();

    if (!this.twilio.isEnabled && !this.exotel.isEnabled) {
      logger.warn(
        'No SMS providers configured - SMS will be logged to console only'
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
    if (!this.twilio.isEnabled && !this.exotel.isEnabled) {
      // Development mode
      logger.info(`[DEV MODE] SMS to ${phoneNumber}: ${message}`);
      return true;
    }

    let success = false;

    // Route logic: +91 goes to Exotel first
    if (phoneNumber.startsWith('+91') && this.exotel.isEnabled) {
      logger.info(`Routing SMS to ${phoneNumber} via Exotel...`);
      success = await this.exotel.sendSMS(phoneNumber, message, dltTemplateId);

      // Fallback to Twilio if Exotel fails and Twilio is enabled
      if (!success && this.twilio.isEnabled) {
        logger.warn(
          `Exotel failed, falling back to Twilio for ${phoneNumber}...`
        );
        success = await this.twilio.sendSMS(phoneNumber, message);
      }
    } else if (this.twilio.isEnabled) {
      // Non-Indian number or Exotel disabled: use Twilio
      logger.info(`Routing SMS to ${phoneNumber} via Twilio...`);
      success = await this.twilio.sendSMS(phoneNumber, message);
    } else if (this.exotel.isEnabled) {
      // Twilio disabled, but Exotel is enabled (try Exotel anyway)
      logger.info(
        `Routing SMS to ${phoneNumber} via Exotel (Twilio disabled)...`
      );
      success = await this.exotel.sendSMS(phoneNumber, message, dltTemplateId);
    }

    if (!success) {
      logger.error('All configured SMS providers failed to send message');
      throw new Error('Failed to send verification code');
    }

    return true;
  }
}

export const smsService = new SMSService();
