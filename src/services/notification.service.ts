import { getFirebaseMessaging, isFirebaseReady } from '../config/firebase';
import { logger } from '../utils';
import type { MulticastMessage } from 'firebase-admin/messaging';
import { db } from '../db';
import { deviceTokens } from '../models';
import { eq } from 'drizzle-orm';

// ─── Payload Interfaces ───────────────────────────────────────────────────────

export interface CallNotificationPayload {
  callId: string;
  callerId: string;
  callerUsername: string;
  iceServers?: string; // JSON-serialized RTCIceServer[] for offline receiver
  reconnect?: boolean;
}

export interface MessageNotificationPayload {
  chatSessionId: string;
  senderId: string;
  senderUsername: string;
  messagePreview: string; // Truncated for privacy (max 100 chars)
}

// ─── Notification Service ─────────────────────────────────────────────────────

class NotificationService {
  /**
   * Sends a HIGH-PRIORITY incoming call push to one or more device tokens.
   * Uses a data-only message so the mobile app can handle it as a VoIP/call UI trigger.
   * Android: priority=high wakes the device even in Doze mode.
   * iOS: apns-priority=10 + apns-push-type=voip for PushKit (add content-available for normal APNs fallback).
   */
  async sendCallNotification(
    deviceTokens: string[],
    payload: CallNotificationPayload
  ): Promise<void> {
    if (!this.isReady(deviceTokens)) return;

    const message: MulticastMessage = {
      tokens: deviceTokens,
      // Top-level notification block: CRITICAL for killed-state delivery
      notification: {
        title: 'Incoming Call',
        body: payload.reconnect
          ? 'Reconnecting call...'
          : `${payload.callerUsername} is calling you`,
      },
      // Data payload for app-level VoIP/reconnection logic
      data: {
        type: 'incoming_call',
        callId: payload.callId,
        callerId: payload.callerId,
        callerUsername: payload.callerUsername,
        ...(payload.iceServers ? { iceServers: payload.iceServers } : {}),
        reconnect: payload.reconnect ? 'true' : 'false',
        timestamp: new Date().toISOString(),
      },
      android: {
        priority: 'high',
        ttl: 30000,
        notification: {
          channelId: 'incoming_calls',
          sound: 'ringtone',
          priority: 'high',
        },
      },
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-expiration': String(Math.floor(Date.now() / 1000) + 30),
        },
        payload: {
          aps: {
            'content-available': 1,
            sound: 'ringtone.caf',
          },
        },
      },
    };

    await this.sendMulticast(message, 'call notification');
  }

  /**
   * Sends a standard new message push notification.
   * This is a normal priority notification that appears in the notification tray.
   */
  async sendMessageNotification(
    deviceTokens: string[],
    payload: MessageNotificationPayload
  ): Promise<void> {
    if (!this.isReady(deviceTokens)) return;

    // Truncate preview to 100 chars for privacy
    const preview =
      payload.messagePreview.length > 100
        ? `${payload.messagePreview.substring(0, 97)}...`
        : payload.messagePreview;

    const message: MulticastMessage = {
      tokens: deviceTokens,
      notification: {
        title: payload.senderUsername,
        body: preview,
      },
      data: {
        type: 'new_message',
        chatSessionId: payload.chatSessionId,
        senderId: payload.senderId,
        senderUsername: payload.senderUsername,
        timestamp: new Date().toISOString(),
      },
      android: {
        priority: 'high', // Use high priority for better killed-state delivery
        notification: {
          channelId: 'messages',
          sound: 'default',
          clickAction: 'OPEN_CHAT',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    await this.sendMulticast(message, 'message notification');
  }

  /**
   * Sends a generic data-only push (e.g., for silent sync/refresh signals).
   */
  async sendDataNotification(
    deviceTokens: string[],
    data: Record<string, string>
  ): Promise<void> {
    if (!this.isReady(deviceTokens)) return;

    const message: MulticastMessage = {
      tokens: deviceTokens,
      // Include notification block if title/body present in data (fallback for killed state)
      ...(data.title || data.body
        ? {
            notification: {
              title: data.title,
              body: data.body,
            },
          }
        : {}),
      data,
      android: {
        priority: data.type === 'qr_scanned' ? 'high' : 'normal',
      },
      apns: {
        payload: { aps: { 'content-available': 1 } },
        headers: {
          'apns-priority': data.type === 'qr_scanned' ? '10' : '5',
        },
      },
    };

    await this.sendMulticast(message, 'data notification');
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private isReady(deviceTokens: string[]): boolean {
    if (!isFirebaseReady()) {
      logger.debug('Push notification skipped: Firebase not initialized');
      return false;
    }
    if (!deviceTokens || deviceTokens.length === 0) {
      logger.debug('Push notification skipped: no device tokens');
      return false;
    }
    return true;
  }

  private async sendMulticast(
    message: MulticastMessage,
    type: string
  ): Promise<void> {
    const messaging = getFirebaseMessaging();
    if (!messaging) return;

    try {
      const response = await messaging.sendEachForMulticast(message);

      logger.info(
        `📱 Push [${type}]: ${response.successCount} sent, ${response.failureCount} failed`
      );

      // Log individual failures with their error codes for debugging
      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errorCode = resp.error?.code || 'unknown';
            const token = message.tokens[idx];
            logger.warn(
              `Push failed for token ${token.substring(0, 10)}...: ${errorCode}`
            );

            // Handle stale/invalid tokens — caller should remove these from DB
            if (
              errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/registration-token-not-registered'
            ) {
              logger.warn(
                `Stale device token detected: ${token.substring(0, 10)}... — removing from DB`
              );
              // Clean up stale tokens from DB
              db.delete(deviceTokens)
                .where(eq(deviceTokens.token, token))
                .catch(err => {
                  logger.error('Failed to remove stale token from DB:', err);
                });
            }
          }
        });
      }
    } catch (error) {
      // Never throw from notification service — a push failure must not break the main flow
      logger.error(`Failed to send ${type}:`, error);
    }
  }
}

export const notificationService = new NotificationService();
