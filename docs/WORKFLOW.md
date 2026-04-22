# Complete Workflow Guide

This guide covers all workflows for both admin and regular users.

## Table of Contents

- [User Workflows](#user-workflows)
- [Admin Workflows](#admin-workflows)

---

## User Workflows

### 1. Registration & Authentication

- Phone is **MANDATORY**
- System generates 6-digit OTP
- SMS sent via Twilio (or logged to console in dev)
- Auto-creates FREE subscription
- Returns temp JWT token (for verification)
- Account status: `pending_verification`
- Unverified users can still log in and should be redirected to OTP verification by the client
- Accounts left unverified for more than 7 days are soft-deleted on login attempt

#### Login

```
POST /api/auth/login
{
  "username": "johndoe",
  "password": "securePassword123"
}
```

- Returns JWT token
- Also returns verification metadata so the client can redirect unverified users to OTP verification
- Use token in all subsequent requests: `Authorization: Bearer <token>`

#### Get Profile

```
GET /api/auth/profile
Headers: Authorization: Bearer <token>
```

#### Change Password

```
POST /api/auth/change-password
Headers: Authorization: Bearer <token>
{
  "oldPassword": "securePassword123",
  "newPassword": "newSecurePassword456"
}
```

### 1.1 Device Token Management (Push Notifications)

To receive calls and messages while offline, the app must register its FCM token.

#### Register Device Token

```
POST /api/users/device-tokens
Headers: Authorization: Bearer <token>
{
  "token": "FCM_REGISTER_TOKEN_HERE",
  "platform": "android",  // android | ios | web
  "deviceId": "uuid"      // optional
}
```

#### Remove Token (on logout)

```
DELETE /api/users/device-tokens/:token
Headers: Authorization: Bearer <token>
```

### 2. QR Code Management

#### Claim QR Code

```
POST /api/qr-codes/claim
Headers: Authorization: Bearer <token>
{
  "humanToken": "QR-K9F7-M2QX"
}
```

- User enters human-readable code
- QR becomes active and assigned to user

#### Get My QR Codes

```
GET /api/qr-codes/my-codes
Headers: Authorization: Bearer <token>
```

#### Scan QR Code (No Auth Required)

```
POST /api/qr-codes/scan
{
  "token": "64-char-hex-token"
}
```

- Returns QR owner's profile (id, username, status)
- Used before initiating call or chat

#### Get QR Code Image

```
GET /api/qr-codes/image/:token
```

- Returns PNG image

#### Disable/Reactivate QR Code

```
PATCH /api/qr-codes/:qrCodeId/disable
PATCH /api/qr-codes/:qrCodeId/reactivate
Headers: Authorization: Bearer <token>
```

#### Revoke QR Code (Permanent)

```
PATCH /api/qr-codes/:qrCodeId/revoke
Headers: Authorization: Bearer <token>
```

### 3. Voice/Video Call Workflow

```
Flow: Scan QR → Initiate Call → WebRTC Signaling → Accept/Reject → End Call
```

#### Step 1: Scan QR Code

```
POST /api/qr-codes/scan
{ "token": "scanned-token" }
```

#### Step 2: Initiate Call

```
POST /api/calls/initiate
Headers: Authorization: Bearer <token>
{
  "qrToken": "scanned-token"
}
```

- Triggers Socket.IO `incoming-call` event to receiver

#### Step 3: Get WebRTC Config

```
GET /api/webrtc/config
Headers: Authorization: Bearer <token>
```

- Returns STUN/TURN servers

#### Step 4: WebRTC Signaling (Socket.IO)

```javascript
// Send granular signaling events
socket.emit('webrtc-offer', { callId: 'CALL_ID', offer: rtcOffer });
socket.emit('webrtc-answer', { callId: 'CALL_ID', answer: rtcAnswer });
socket.emit('webrtc-ice-candidate', {
  callId: 'CALL_ID',
  candidate: rtcCandidate,
});

// Listen for signals
socket.on('webrtc-offer', data => {
  // Handle offer
});
socket.on('webrtc-answer', data => {
  // Handle answer
});
socket.on('webrtc-ice-candidate', data => {
  // Handle ICE candidate
});

// Listen for incoming calls
socket.on('incoming-call', data => {
  // data = { callId, callerId, callerUsername }
  // Show incoming call UI with caller's name
  console.log(`Incoming call from ${data.callerUsername}`);
});
```

#### Step 5: Accept/Reject Call

```
PATCH /api/calls/:callId/accept
PATCH /api/calls/:callId/reject
Headers: Authorization: Bearer <token>
```

#### Step 6: End Call

```
PATCH /api/calls/:callId/end
Headers: Authorization: Bearer <token>
{ "reason": "completed" }
```

#### Step 7: Reliability & Reconnection (Automatic)

- **Network loss**: If a user's socket drops, the call stays active for **30 seconds**.
- **Wake-up push**: If the user is still offline after 3 seconds, the server sends a "wake-up" push with `reconnect: "true"`.
- **Termination**: If 30 seconds pass without reconnection, the call is ended with reason `network_lost`.

#### Get Call History

```
GET /api/calls/history/all?limit=50&offset=0
Headers: Authorization: Bearer <token>
```

#### Get Call Usage Stats

```
GET /api/calls/usage/stats
Headers: Authorization: Bearer <token>
```

- Returns daily usage vs limits

### 4. Chat Workflow

```
Flow: Scan QR → Initiate Chat → Join Room → Send Messages → End Chat
```

#### Step 1: Initiate Chat

```
POST /api/chat-sessions/initiate
Headers: Authorization: Bearer <token>
{
  "qrToken": "scanned-token"
}
```

#### Step 2: Join Chat Room (Socket.IO)

```javascript
socket.emit('join-chat', { chatSessionId: 'CHAT_ID' });
```

#### Step 3: Send Message

```
POST /api/messages/send
Headers: Authorization: Bearer <token>
{
  "chatSessionId": "CHAT_ID",
  "content": "Hello!",
  "messageType": "text"  // text, image, file, system
}
```

- Triggers Socket.IO `new-message` event

#### Step 4: Real-time Events (Socket.IO)

```javascript
// Listen for new messages
socket.on('new-message', data => {
  // { chatSessionId, messageId, senderId }
});

// Typing indicators
socket.emit('typing-start', { chatSessionId });
socket.emit('typing-stop', { chatSessionId });

socket.on('user-typing', data => {
  // Show "User is typing..."
});

socket.on('user-stopped-typing', data => {
  // Hide typing indicator
});

// Read receipts
socket.on('message-read', data => {
  // Update UI with checkmarks
});
```

#### Step 5: Get Messages

```
GET /api/messages/:chatSessionId?limit=50&offset=0
Headers: Authorization: Bearer <token>
```

#### Step 6: Mark as Read

```
PATCH /api/messages/:messageId/read
PATCH /api/messages/chat/:chatSessionId/read  // Mark all as read
Headers: Authorization: Bearer <token>
```

#### Get Unread Count

```
GET /api/messages/unread-count
Headers: Authorization: Bearer <token>
```

#### Search Messages

```
GET /api/messages/:chatSessionId/search?query=hello
Headers: Authorization: Bearer <token>
```

#### Delete Message

```
DELETE /api/messages/:messageId
Headers: Authorization: Bearer <token>
```

- Soft delete, only sender can delete

#### End Chat

```
PATCH /api/chat-sessions/:chatSessionId/end
Headers: Authorization: Bearer <token>
```

#### Get My Chats

```
GET /api/chat-sessions/my-chats?limit=50&offset=0
Headers: Authorization: Bearer <token>
```

### 5. Subscription Management

#### Get Active Subscription

```
GET /api/subscriptions/active
Headers: Authorization: Bearer <token>
```

#### Get Usage Stats

```
GET /api/subscriptions/usage
Headers: Authorization: Bearer <token>
```

- Returns daily calls/messages used vs limits

#### Upgrade Plan

```
POST /api/subscriptions/upgrade
Headers: Authorization: Bearer <token>
{
  "plan": "pro"  // or "enterprise"
}
```

#### Get Subscription History

```
GET /api/subscriptions/history
Headers: Authorization: Bearer <token>
```

### 6. Push Notification Workflow

#### Calling Offline User

1. Caller initiates call via REST and Socket.
2. Server checks if Receiver is online via Socket.
3. If **offline**, Server sends HIGH-PRIORITY FCM push (type: `incoming_call`).
4. Receiver's device wakes up, App connects to Socket, and joins the call.

#### Messaging Offline User

1. Sender sends message via REST and Socket.
2. Server checks if Recipient is in the chat room.
3. If **offline**, Server sends FCM push (type: `new_message`) with message preview.
4. Recipient is notified via system tray.

#### Call Reconnection (Wake-up)

1. Participant loses socket during active call.
2. Server waits 3 seconds then sends high-priority FCM push with `reconnect: "true"`.
3. App wakes up, re-connects socket within the 30s window.
4. Signaling resumes automatically.

See **[PUSH_NOTIFICATIONS.md](./PUSH_NOTIFICATIONS.md)** for detailed integration steps.

### 7. Full Payment & Subscription Workflow

```
Flow: Get Plans → Create Order → Complete Payment → Verify Payment → Subscription Activated
```

#### Step 1: Get Available Plans

```
GET /api/payments/plans
Headers: Authorization: Bearer <token>
```

- Returns FREE, PRO, ENTERPRISE plans with pricing and limits

#### Step 2: Create Payment Order

```
POST /api/payments/create-order
Headers: Authorization: Bearer <token>
{
  "plan": "pro"  // or "enterprise"
}
```

- Creates Razorpay order
- Returns: orderId, amount, currency, keyId

#### Step 3: Complete Payment (Frontend)

```javascript
// Use Razorpay Checkout
const options = {
  key: response.data.keyId,
  amount: response.data.amount,
  currency: response.data.currency,
  order_id: response.data.orderId,
  name: 'CallQR',
  description: 'Subscription Payment',
  handler: function (response) {
    // Payment successful, verify on backend
    verifyPayment(response);
  },
};
const rzp = new Razorpay(options);
rzp.open();
```

#### Step 4: Verify Payment

```
POST /api/payments/verify
Headers: Authorization: Bearer <token>
{
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "signature_xxx"
}
```

- Verifies payment signature
- Activates subscription
- Returns subscription details

#### Step 5: Handle Payment Failure

```
POST /api/payments/failed
Headers: Authorization: Bearer <token>
{
  "razorpay_order_id": "order_xxx",
  "error_code": "PAYMENT_FAILED",
  "error_description": "Card declined"
}
```

- Records failed payment for tracking

#### Get Payment History

```
GET /api/payments/history
Headers: Authorization: Bearer <token>
```

- Returns all payment transactions

#### Downgrade Subscription

**Step 1: Check Eligibility**

```
GET /api/subscriptions/downgrade/check?plan=free
Headers: Authorization: Bearer <token>
```

- Checks if current usage allows downgrade
- Returns eligibility status and warnings

**Step 2: Downgrade (if eligible)**

```
POST /api/subscriptions/downgrade
Headers: Authorization: Bearer <token>
{
  "plan": "free"  // or "pro"
}
```

- Downgrades subscription immediately
- New limits apply right away
- Cannot downgrade if current usage exceeds new limits

**Downgrade Rules:**

- Enterprise → Pro: Allowed if usage within Pro limits
- Enterprise → Free: Allowed if usage within Free limits
- Pro → Free: Allowed if usage within Free limits
- Cannot downgrade if:
  - Today's calls exceed new limit
  - Today's messages exceed new limit
  - Active chats exceed new limit

**Example Workflow:**

```javascript
// 1. Check if downgrade is possible
const checkResponse = await fetch(
  '/api/subscriptions/downgrade/check?plan=free',
  {
    headers: { Authorization: `Bearer ${token}` },
  }
);
const eligibility = await checkResponse.json();

if (eligibility.data.eligible) {
  // 2. Proceed with downgrade
  const downgradeResponse = await fetch('/api/subscriptions/downgrade', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ plan: 'free' }),
  });

  if (downgradeResponse.ok) {
    alert('Downgraded successfully!');
  }
} else {
  // Show warnings to user
  alert(`Cannot downgrade: ${eligibility.data.warnings.join(', ')}`);
}
```

### 7. Bug Reporting

#### Submit Bug Report (Anonymous OK)

```
POST /api/reports
Headers: Authorization: Bearer <token>  // Optional
{
  "description": "App crashes when uploading images",
  "severity": "high"  // low, medium, high, critical
}
```

#### Get My Reports

```
GET /api/reports/my/all
Headers: Authorization: Bearer <token>
```

#### Get Report Details

```
GET /api/reports/:reportId
Headers: Authorization: Bearer <token>
```

---

## Admin Workflows

### 1. Admin Setup

#### Create Admin User

1. Register account via `/api/auth/register`
2. Copy user ID from response
3. Add to `.env`: `ADMIN_USER_IDS=user-id-here`
4. Restart server

### 2. User Management

#### Get All Users

```
GET /api/admin/users?status=active&limit=50&offset=0
Headers: Authorization: Bearer <admin-token>
```

- Filter by status: active, blocked, deleted

#### Get User Details

```
GET /api/admin/users/:userId
Headers: Authorization: Bearer <admin-token>
```

- Returns user info, subscription, QR codes, call stats

#### Block/Unblock User

```
PATCH /api/admin/users/:userId/block
PATCH /api/admin/users/:userId/unblock
Headers: Authorization: Bearer <admin-token>
```

#### Delete User

```
DELETE /api/admin/users/:userId
Headers: Authorization: Bearer <admin-token>
```

- Soft delete

### 3. QR Code Management

#### Bulk Create QR Codes

```
POST /api/admin/qr-codes/bulk-create
Headers: Authorization: Bearer <admin-token>
{
  "count": 100  // Max: 2000
}
```

- Creates unassigned QR codes
- Each has token (64-char hex) and humanToken (QR-XXXX-XXXX)

#### Get All QR Codes

```
GET /api/admin/qr-codes?status=unassigned&limit=50&offset=0
Headers: Authorization: Bearer <admin-token>
```

- Filter by status: unassigned, active, disabled, revoked

#### Get QR Code Details

```
GET /api/admin/qr-codes/:qrCodeId
Headers: Authorization: Bearer <admin-token>
```

#### Assign QR to User

```
POST /api/admin/qr-codes/:qrCodeId/assign
Headers: Authorization: Bearer <admin-token>
{
  "userId": "user-uuid"
}
```

#### Revoke QR Code

```
PATCH /api/admin/qr-codes/:qrCodeId/revoke
Headers: Authorization: Bearer <admin-token>
```

### 4. Call & Chat Monitoring

#### Get Call History

```
GET /api/admin/calls?status=ended&startDate=2026-01-01&limit=50
Headers: Authorization: Bearer <admin-token>
```

#### Get Call Details

```
GET /api/admin/calls/:callId
Headers: Authorization: Bearer <admin-token>
```

#### Get Chat History

```
GET /api/admin/chats?status=active&limit=50
Headers: Authorization: Bearer <admin-token>
```

#### Get Chat Details

```
GET /api/admin/chats/:chatId
Headers: Authorization: Bearer <admin-token>
```

### 5. Real-Time Monitoring

#### Get Active Calls

```
GET /api/admin/monitoring/active-calls
Headers: Authorization: Bearer <admin-token>
```

#### Get Active Chats

```
GET /api/admin/monitoring/active-chats
Headers: Authorization: Bearer <admin-token>
```

#### Get Recent Activity

```
GET /api/admin/monitoring/recent-activity?limit=100
Headers: Authorization: Bearer <admin-token>
```

#### Get System Health

```
GET /api/admin/monitoring/system-health
Headers: Authorization: Bearer <admin-token>
```

### 6. Analytics & Reports

#### Dashboard Overview

```
GET /api/admin/overview
Headers: Authorization: Bearer <admin-token>
```

- Total users, QR codes, calls, chats
- Active counts

#### Call Analytics

```
GET /api/admin/analytics/calls?days=30
Headers: Authorization: Bearer <admin-token>
```

- Total calls, success rate, average duration
- Calls by day, by hour, by status

#### Chat Analytics

```
GET /api/admin/analytics/chats?days=30
Headers: Authorization: Bearer <admin-token>
```

- Total chats, messages, average messages per chat
- Chats by day

#### User Growth Analytics

```
GET /api/admin/analytics/user-growth?days=30
Headers: Authorization: Bearer <admin-token>
```

- Total users, new users, growth rate
- Users by day

### 7. Bug Report Management

#### Get All Bug Reports

```
GET /api/admin/bug-reports?status=open&severity=high&limit=50
Headers: Authorization: Bearer <admin-token>
```

#### Get Bug Report Stats

```
GET /api/admin/bug-reports/stats
Headers: Authorization: Bearer <admin-token>
```

- Total, by status, by severity

#### Update Report Status

```
PATCH /api/admin/reports/:reportId/status
Headers: Authorization: Bearer <admin-token>
{
  "status": "in_progress"  // open, in_progress, resolved
}
```

#### Update Report Severity

```
PATCH /api/admin/reports/:reportId/severity
Headers: Authorization: Bearer <admin-token>
{
  "severity": "critical"  // low, medium, high, critical
}
```

### 8. Subscription Management

#### Get All Subscriptions

```
GET /api/admin/subscriptions?plan=pro&status=active&limit=50
Headers: Authorization: Bearer <admin-token>
```

#### Get Subscription Stats

```
GET /api/admin/subscriptions/stats
Headers: Authorization: Bearer <admin-token>
```

- Total, by plan, revenue

#### Create Subscription

```
POST /api/subscriptions
Headers: Authorization: Bearer <admin-token>
{
  "userId": "user-uuid",
  "plan": "pro",
  "expiresAt": "2027-02-18T10:00:00Z"
}
```

### 9. Data Export

#### Export Users

```
GET /api/admin/export/users
Headers: Authorization: Bearer <admin-token>
```

- Returns JSON

#### Export QR Codes

```
GET /api/admin/export/qr-codes
Headers: Authorization: Bearer <admin-token>
```

#### Export Call History

```
GET /api/admin/export/call-history?startDate=2026-01-01&endDate=2026-12-31
Headers: Authorization: Bearer <admin-token>
```

#### Export Chat History

```
GET /api/admin/export/chat-history?startDate=2026-01-01&endDate=2026-12-31
Headers: Authorization: Bearer <admin-token>
```

---

## Socket.IO Events Reference

### Call Events

**Client → Server:**

- `initiate-call` - Start call
- `accept-call` - Accept incoming call
- `reject-call` - Reject incoming call
- `end-call` - End active call
- `webrtc-offer` - Send WebRTC offer
- `webrtc-answer` - Send WebRTC answer
- `webrtc-ice-candidate` - Send ICE candidate

**Server → Client:**

- `incoming-call` - Notify of incoming call
  ```javascript
  {
    callId: "uuid",
    callerId: "user-uuid",
    callerUsername: "John"  // Username of the caller
  }
  ```
- `call-accepted` - Call was accepted
- `call-rejected` - Call was rejected
- `call-ended` - Call ended
- `webrtc-offer` - Receive WebRTC offer
- `webrtc-answer` - Receive WebRTC answer
- `webrtc-ice-candidate` - Receive ICE candidate

### Chat Events

**Client → Server:**

- `join-chat` - Join chat room
- `leave-chat` - Leave chat room
- `chat-message` - Broadcast new message
- `typing-start` - Start typing indicator
- `typing-stop` - Stop typing indicator
- `message-read` - Mark message as read

**Server → Client:**

- `new-message` - New message received
- `message-delivered` - Message delivered confirmation
- `message-read` - Message read by recipient
- `user-typing` - User is typing
- `user-stopped-typing` - User stopped typing

---

## Subscription Limits

| Plan       | Daily Calls | Daily Messages | Active Chats |
| ---------- | ----------- | -------------- | ------------ |
| Free       | 20          | 100            | 5            |
| Pro        | 80          | 500            | 20           |
| Enterprise | 200         | Unlimited      | Unlimited    |

Limits reset daily at midnight UTC.
