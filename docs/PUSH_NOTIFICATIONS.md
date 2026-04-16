# 📱 Push Notifications (FCM)

> Firebase Cloud Messaging push notifications for offline users — covers calls and messages.

---

## Architecture

```
Mobile App                  Backend (Express)              Firebase (FCM)
    │                             │                               │
    │  POST /users/push-token     │                               │
    │────────────────────────────▶│  saves to device_tokens table │
    │                             │                               │
    │  WebSocket connected        │                               │
    │◀────────────────────────────│  real-time events via socket  │
    │                             │                               │
    │  [App backgrounded/killed]  │                               │
    │                             │──sendCallNotification()──────▶│
    │◀────────────────────────────│◀──────────────────────────────│
    │  FCM push wakes the app     │                               │
```

**Rule:** User **online** (socket connected) → socket event. User **offline** → FCM push.

---

## Notification Types

### 📞 Call Notification (HIGH priority)

Sent when receiver has no active socket. Wakes the device even if the app is killed.

**Data payload (Android + iOS):**

```json
{
  "data": {
    "type": "incoming_call",
    "callId": "uuid",
    "callerId": "uuid",
    "callerUsername": "john_doe",
    "timestamp": "2026-03-16T07:00:00.000Z"
  }
}
```

**iOS APNs headers also set:**

- `apns-push-type: voip`
- `apns-priority: 10`

> For a fullscreen ringing UI on iOS when the app is killed, implement **CallKit + PushKit** on the mobile side.

---

### 💬 Message Notification (normal priority)

Sent when recipient is not connected to the socket room.

```json
{
  "notification": {
    "title": "john_doe",
    "body": "Hey, are you free?"
  },
  "data": {
    "type": "new_message",
    "chatSessionId": "uuid",
    "senderId": "uuid",
    "senderUsername": "john_doe",
    "timestamp": "2026-03-16T07:00:00.000Z"
  }
}
```

> Images show `"📎 Sent an attachment"` — message body is never exposed to FCM.

---

## Device Token API

### Register a token (call after login)

```
POST /api/users/push-token
Authorization: Bearer <token>

Body:
{
  "token": "FCM_TOKEN_HERE",
  "platform": "android",     // "android" | "ios" | "web"
  "deviceId": "optional-uuid"  // helps track per-device for multi-device users
}

Response 200:
{
  "success": true,
  "message": "Push token registered successfully"
}
```

**Upsert behaviour:** Same token → updates user. This handles shared/replaced devices cleanly.

### Remove a token (call on logout)

````
DELETE /api/users/push-token
Authorization: Bearer <token>

Body:
{
  "token": "FCM_TOKEN_HERE"
}

Response 200:
{ "message": "Push token removed successfully" }

---

## Database — `device_tokens` table

| Column       | Type      | Notes                       |
| ------------ | --------- | --------------------------- |
| `id`         | uuid      | Primary key                 |
| `user_id`    | uuid      | FK → users (cascade delete) |
| `token`      | text      | FCM token, unique           |
| `platform`   | text      | android / ios / web         |
| `device_id`  | text      | Optional per-device ID      |
| `created_at` | timestamp |                             |
| `updated_at` | timestamp | Refreshed on token rotation |

One user can have **many rows** (multiple devices). All tokens receive the push simultaneously.

---

## Mobile Integration (React Native / Expo)

### Step 1 — Install

```bash
npm install @react-native-firebase/app @react-native-firebase/messaging
````

### Step 2 — Add config files

- **Android:** `google-services.json` → `android/app/`
- **iOS:** `GoogleService-Info.plist` → Xcode project root

### Step 3 — Get token and register

```typescript
import messaging from '@react-native-firebase/messaging';

export async function registerDeviceToken(apiClient: any) {
  const status = await messaging().requestPermission();
  const enabled = [
    messaging.AuthorizationStatus.AUTHORIZED,
    messaging.AuthorizationStatus.PROVISIONAL,
  ].includes(status);

  if (!enabled) return;

  const token = await messaging().getToken();
  if (!token) return;

  await apiClient.post('/users/push-token', {
    token,
    platform: Platform.OS,
    deviceId: await DeviceInfo.getUniqueId(), // react-native-device-info
  });

  // Re-register whenever FCM rotates the token
  messaging().onTokenRefresh(async newToken => {
    await apiClient.post('/users/push-token', {
      token: newToken,
      platform: Platform.OS,
    });
  });
}
```

### Step 4 — Remove token on logout

```typescript
export async function unregisterDeviceToken(apiClient: any) {
  const token = await messaging().getToken();
  if (!token) return;
  await apiClient.delete('/users/push-token', {
    data: { token },
  });
  await messaging().deleteToken();
}
```

### Step 5 — Handle pushes

```typescript
type PushData = {
  type: 'incoming_call' | 'new_message';
  callId?: string;
  callerId?: string;
  callerUsername?: string;
  chatSessionId?: string;
  senderUsername?: string;
};

function routePush(message: any) {
  const data = message.data as PushData;
  if (data.type === 'incoming_call') {
    navigationRef.navigate('IncomingCall', {
      callId: data.callId,
      callerUsername: data.callerUsername,
    });
  }
  if (data.type === 'new_message') {
    navigationRef.navigate('Chat', { chatSessionId: data.chatSessionId });
  }
}

// Wire up in root App component
export function setupPushHandlers() {
  const unsubFg = messaging().onMessage(routePush); // App in foreground
  messaging().onNotificationOpenedApp(routePush); // App backgrounded
  messaging()
    .getInitialNotification()
    .then(m => m && routePush(m)); // App was killed
  return unsubFg; // return for useEffect cleanup
}
```

### Step 6 — Background handler (`index.js`, before AppRegistry)

```javascript
// index.js
import messaging from '@react-native-firebase/messaging';

messaging().setBackgroundMessageHandler(async remoteMessage => {
  // Runs in a headless JS task when app is killed
  // For calls: trigger a local notification here so user can tap to open
  console.log('[Background push]', remoteMessage.data);
});
```

---

## Backend Environment Variables

```env
# Option A — service account JSON file (recommended for local dev)
FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/serviceAccount.json

# Option B — individual values (recommended for production/CI)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

The server starts normally even if Firebase is not configured — it just silently skips pushes.

---

## Known Limitations & Next Steps

| Topic                    | Status              | Action needed                                                             |
| ------------------------ | ------------------- | ------------------------------------------------------------------------- |
| Stale token cleanup      | Logged as warning   | Delete token from DB when FCM returns `registration-token-not-registered` |
| iOS VoIP / CallKit       | APNs data push sent | Mobile: register separate PushKit token, send with `platform: "ios-voip"` |
| Call timeout (missed)    | No auto-expiry      | Cron job to mark calls as `missed` after 30s in `ringing` state           |
| Notification preferences | All-or-nothing      | Add `notification_settings` table for per-chat mute / DND                 |
