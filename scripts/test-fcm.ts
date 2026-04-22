import 'dotenv/config';
import { initializeFirebase } from '../src/config/firebase';
import { notificationService } from '../src/services/notification.service';
import { logger } from '../src/utils/logger';

/**
 * Manual Test Script for FCM Push Notifications (TypeScript version)
 *
 * Usage:
 * npx ts-node scripts/test-fcm.ts --token <FCM_TOKEN> --type <call|message|scan>
 */

async function runTest() {
  const args = process.argv.slice(2);
  const tokenIndex = args.indexOf('--token');
  const typeIndex = args.indexOf('--type');

  const token = tokenIndex !== -1 ? args[tokenIndex + 1] : null;
  const type = typeIndex !== -1 ? args[typeIndex + 1] : 'call';

  if (!token) {
    console.error('❌ Error: --token is required');
    console.log(
      'Usage: npx ts-node scripts/test-fcm.ts --token <FCM_TOKEN> --type <call|message|scan>'
    );
    process.exit(1);
  }

  // Initialize Firebase
  initializeFirebase();

  console.log(
    `🚀 Sending test ${type} notification to token: ${token.substring(0, 10)}...`
  );

  try {
    if (type === 'call') {
      await notificationService.sendCallNotification([token], {
        callId: 'test-call-id',
        callerId: 'test-caller-id',
        callerUsername: 'Test User (Admin)',
        reconnect: false,
      });
    } else if (type === 'message') {
      await notificationService.sendMessageNotification([token], {
        chatSessionId: 'test-chat-id',
        senderId: 'test-sender-id',
        senderUsername: 'Test Friend',
        messagePreview: 'This is a test message from the backend script!',
      });
    } else if (type === 'scan') {
      await notificationService.sendDataNotification([token], {
        type: 'qr_scanned',
        qrCodeId: 'QR-TEST-1234',
        title: 'QR Scanned',
        body: 'Someone scanned your test QR code!',
      });
    }

    console.log('✅ Test notification command sent to FCM.');
    console.log('Check your server logs for the result: info: 📱 Push [...]');
  } catch (error) {
    console.error('❌ Failed to send test notification:', error);
  }

  // Give it a second to finish logging before exiting
  setTimeout(() => process.exit(0), 2000);
}

runTest();
