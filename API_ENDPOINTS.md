# API Endpoints Reference

Complete list of all available API endpoints.

## Base URL
```
http://localhost:9001/api
```

## Authentication
All protected endpoints require JWT token:
```
Authorization: Bearer <your-jwt-token>
```

## User Privacy & Data Access

**Important:** Users can only access their own data:
- ✅ **Profile**: `GET /api/auth/profile` - Your profile with decrypted phone/email
- ✅ **Call History**: `GET /api/calls/history/all` - Only your calls (as caller or receiver)
- ✅ **Chat History**: `GET /api/chat-sessions/my-chats` - Only your chats (as participant)
- ✅ **QR Codes**: `GET /api/qr-codes/my-codes` - Only QR codes you own

Users **cannot** access other users' data unless they are admin.

---

## Authentication Endpoints

### Register User
```
POST /api/auth/register
```
**Body:**
```json
{
  "username": "string (required)",
  "password": "string (required)",
  "phone": "string (optional)",
  "email": "string (optional)"
}
```
**Response:** JWT token + user data

### Login
```
POST /api/auth/login
```
**Body:**
```json
{
  "username": "string (required)",
  "password": "string (required)"
}
```
**Response:** JWT token + user data

### Get Profile
```
GET /api/auth/profile
```
**Auth:** Required  
**Response:**
```json
{
  "success": true,
  "message": "Profile retrieved successfully",
  "data": {
    "id": "uuid",
    "username": "string",
    "phone": "string | null (decrypted)",
    "email": "string | null (decrypted)",
    "status": "string (active|blocked|deleted)",
    "createdAt": "ISO date",
    "updatedAt": "ISO date"
  }
}
```

**Note:** Users can only see their own profile data. Phone and email are decrypted for display.

### Change Password
```
POST /api/auth/change-password
```
**Auth:** Required  
**Body:**
```json
{
  "oldPassword": "string (required)",
  "newPassword": "string (required)"
}
```

---

## User Management Endpoints

### Get User by ID
```
GET /api/users/:userId
```
**Auth:** Required

### Update User
```
PATCH /api/users/:userId
```
**Auth:** Required  
**Body:**
```json
{
  "phone": "string (optional)",
  "email": "string (optional)"
}
```

### Block User (Admin)
```
PATCH /api/users/:userId/block
```
**Auth:** Admin Required

### Activate User (Admin)
```
PATCH /api/users/:userId/activate
```
**Auth:** Admin Required

### Delete User (Admin)
```
DELETE /api/users/:userId
```
**Auth:** Admin Required

### Verify Phone
```
POST /api/users/verify/phone
```
**Body:**
```json
{
  "phone": "string (required)",
  "code": "string (required)"
}
```

### Verify Email
```
POST /api/users/verify/email
```
**Body:**
```json
{
  "email": "string (required)",
  "code": "string (required)"
}
```

---

## QR Code Endpoints

### Create QR Code (Admin)
```
POST /api/qr-codes/create
```
**Auth:** Admin Required  
**Body:**
```json
{
  "userId": "uuid (optional)"
}
```

### Bulk Create QR Codes (Admin)
```
POST /api/qr-codes/bulk-create
```
**Auth:** Admin Required  
**Body:**
```json
{
  "count": "number (1-2000, required)"
}
```

### Claim QR Code
```
POST /api/qr-codes/claim
```
**Auth:** Required  
**Body:**
```json
{
  "humanToken": "string (required, e.g., QR-K9F7-M2QX)"
}
```

### Assign QR Code (Admin)
```
POST /api/qr-codes/:qrCodeId/assign
```
**Auth:** Admin Required  
**Body:**
```json
{
  "userId": "uuid (required)"
}
```

### Scan QR Code
```
POST /api/qr-codes/scan
```
**Auth:** Not Required  
**Body:**
```json
{
  "token": "string (required, 64-char hex)"
}
```

### Get My QR Codes
```
GET /api/qr-codes/my-codes
```
**Auth:** Required  
**Response:**
```json
{
  "success": true,
  "message": "QR codes retrieved successfully",
  "data": {
    "qrCodes": [
      {
        "id": "uuid",
        "token": "string (64-char hex)",
        "humanToken": "string (e.g., QR-K9F7-M2QX)",
        "status": "string (active|disabled|revoked)",
        "assignedAt": "ISO date",
        "createdAt": "ISO date"
      }
    ]
  }
}
```

**Note:** Returns only QR codes owned by the authenticated user.

### Get Unassigned QR Codes (Admin)
```
GET /api/qr-codes/unassigned
```
**Auth:** Admin Required

### Get QR Code Image
```
GET /api/qr-codes/image/:token
```
**Auth:** Not Required  
**Response:** PNG image

### Revoke QR Code
```
PATCH /api/qr-codes/:qrCodeId/revoke
```
**Auth:** Required

### Disable QR Code
```
PATCH /api/qr-codes/:qrCodeId/disable
```
**Auth:** Required

### Reactivate QR Code
```
PATCH /api/qr-codes/:qrCodeId/reactivate
```
**Auth:** Required

---

## Call Session Endpoints

### Initiate Call
```
POST /api/calls/initiate
```
**Auth:** Required  
**Body:**
```json
{
  "qrToken": "string (required)"
}
```

### Get Call Details
```
GET /api/calls/:callId
```
**Auth:** Required

### Accept Call
```
PATCH /api/calls/:callId/accept
```
**Auth:** Required

### Reject Call
```
PATCH /api/calls/:callId/reject
```
**Auth:** Required

### Update Call Status
```
PATCH /api/calls/:callId/status
```
**Auth:** Required  
**Body:**
```json
{
  "status": "string (initiated|ringing|connected|ended|failed)"
}
```

### End Call
```
PATCH /api/calls/:callId/end
```
**Auth:** Required  
**Body:**
```json
{
  "reason": "string (optional)"
}
```

### Get Call History
```
GET /api/calls/history/all
```
**Auth:** Required  
**Query Params:** `limit` (default: 50)  
**Response:**
```json
{
  "success": true,
  "message": "Call history retrieved successfully",
  "data": {
    "calls": [
      {
        "id": "uuid",
        "callerId": "uuid",
        "receiverId": "uuid",
        "status": "string (initiated|ringing|connected|ended|failed)",
        "endedReason": "string | null",
        "startedAt": "ISO date",
        "endedAt": "ISO date | null"
      }
    ]
  }
}
```

**Note:** Returns only calls where the authenticated user is either caller or receiver.

### Get Active Calls
```
GET /api/calls/active/list
```
**Auth:** Required

### Get Call Usage Stats
```
GET /api/calls/usage/stats
```
**Auth:** Required

---

## Chat Session Endpoints

### Initiate Chat
```
POST /api/chat-sessions/initiate
```
**Auth:** Required  
**Body:**
```json
{
  "qrToken": "string (required)"
}
```

### Get Chat Session Details
```
GET /api/chat-sessions/:chatSessionId
```
**Auth:** Required

### Get My Chats
```
GET /api/chat-sessions/my-chats
```
**Auth:** Required  
**Query Params:** `limit` (default: 50)  
**Response:**
```json
{
  "success": true,
  "message": "Chat sessions retrieved successfully",
  "data": {
    "chats": [
      {
        "id": "uuid",
        "participant1Id": "uuid",
        "participant2Id": "uuid",
        "status": "string (active|ended|blocked)",
        "startedAt": "ISO date",
        "endedAt": "ISO date | null",
        "lastMessageAt": "ISO date | null",
        "lastMessage": {
          "id": "uuid",
          "senderId": "uuid",
          "content": "string",
          "messageType": "string",
          "sentAt": "ISO date"
        } | null,
        "unreadCount": "number"
      }
    ]
  }
}
```

**Note:** Returns only chats where the authenticated user is a participant.

### Get Active Chats
```
GET /api/chat-sessions/active
```
**Auth:** Required

### End Chat Session
```
PATCH /api/chat-sessions/:chatSessionId/end
```
**Auth:** Required

### Block Chat Session
```
PATCH /api/chat-sessions/:chatSessionId/block
```
**Auth:** Required

---

## Message Endpoints

### Send Message
```
POST /api/messages/send
```
**Auth:** Required  
**Body:**
```json
{
  "chatSessionId": "uuid (required)",
  "content": "string (required)",
  "messageType": "string (text|image|file|system, default: text)"
}
```

### Get Messages
```
GET /api/messages/:chatSessionId
```
**Auth:** Required  
**Query Params:** `limit`, `offset`

### Mark Message as Read
```
PATCH /api/messages/:messageId/read
```
**Auth:** Required

### Mark Chat as Read
```
PATCH /api/messages/chat/:chatSessionId/read
```
**Auth:** Required

### Delete Message
```
DELETE /api/messages/:messageId
```
**Auth:** Required

### Get Unread Count
```
GET /api/messages/unread-count
```
**Auth:** Required

### Search Messages
```
GET /api/messages/:chatSessionId/search
```
**Auth:** Required  
**Query Params:** `query` (required)

---

## Subscription Endpoints

### Create Subscription (Admin)
```
POST /api/subscriptions
```
**Auth:** Admin Required  
**Body:**
```json
{
  "userId": "uuid (required)",
  "plan": "string (free|pro|enterprise, required)",
  "expiresAt": "ISO date (optional)"
}
```

### Get Active Subscription
```
GET /api/subscriptions/active
```
**Auth:** Required

### Get Subscription History
```
GET /api/subscriptions/history
```
**Auth:** Required

### Get Plan Details
```
GET /api/subscriptions/plan
```
**Auth:** Required

### Get Usage Stats
```
GET /api/subscriptions/usage
```
**Auth:** Required

### Upgrade Plan
```
POST /api/subscriptions/upgrade
```
**Auth:** Required  
**Body:**
```json
{
  "plan": "string (pro|enterprise, required)"
}
```

### Cancel Subscription
```
DELETE /api/subscriptions/:subscriptionId
```
**Auth:** Required

---

## Payment Endpoints

### Get Subscription Plans
```
GET /api/payments/plans
```
**Auth:** Required  
**Response:**
```json
{
  "success": true,
  "data": {
    "plans": [
      {
        "id": "free",
        "name": "Free",
        "price": "₹0",
        "features": ["20 calls/day", "50 messages/day", "5 active chats"]
      },
      {
        "id": "pro",
        "name": "Pro",
        "price": "₹299/month",
        "duration": "30 days",
        "features": ["80 calls/day", "500 messages/day", "20 active chats"]
      },
      {
        "id": "enterprise",
        "name": "Enterprise",
        "price": "₹999/month",
        "duration": "30 days",
        "features": ["200 calls/day", "Unlimited messages", "Unlimited chats"]
      }
    ]
  }
}
```

### Create Payment Order
```
POST /api/payments/create-order
```
**Auth:** Required  
**Body:**
```json
{
  "plan": "string (pro|enterprise, required)"
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "order_xxxxxxxxxxxxx",
    "amount": 29900,
    "currency": "INR",
    "keyId": "rzp_test_xxxxxxxxxxxxx"
  }
}
```
**Note:** Amount is in paise (₹299 = 29900 paise)

### Verify Payment
```
POST /api/payments/verify
```
**Auth:** Required  
**Body:**
```json
{
  "razorpay_order_id": "string (required)",
  "razorpay_payment_id": "string (required)",
  "razorpay_signature": "string (required)"
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "paymentId": "pay_xxxxxxxxxxxxx",
    "status": "paid",
    "plan": "pro"
  }
}
```
**Note:** This activates the subscription automatically

### Record Payment Failure
```
POST /api/payments/failed
```
**Auth:** Required  
**Body:**
```json
{
  "razorpay_order_id": "string (required)",
  "error_code": "string (optional)",
  "error_description": "string (optional)"
}
```

### Get Payment History
```
GET /api/payments/history
```
**Auth:** Required  
**Response:**
```json
{
  "success": true,
  "data": {
    "payments": [
      {
        "id": "uuid",
        "orderId": "order_xxxxxxxxxxxxx",
        "paymentId": "pay_xxxxxxxxxxxxx",
        "amount": 29900,
        "currency": "INR",
        "plan": "pro",
        "status": "paid",
        "createdAt": "2026-02-21T10:00:00Z",
        "paidAt": "2026-02-21T10:05:00Z"
      }
    ]
  }
}
```

### Razorpay Webhook
```
POST /api/payments/webhook
```
**Auth:** None (verified via signature)  
**Headers:**
```
x-razorpay-signature: <webhook-signature>
```
**Note:** This is called by Razorpay, not by clients

---

## Bug Report Endpoints

### Create Bug Report
```
POST /api/reports
```
**Auth:** Optional (can be anonymous)  
**Body:**
```json
{
  "description": "string (required)",
  "severity": "string (low|medium|high|critical, default: medium)"
}
```

### Get Bug Report
```
GET /api/reports/:reportId
```
**Auth:** Required

### Get My Reports
```
GET /api/reports/my/all
```
**Auth:** Required

### Get All Reports (Admin)
```
GET /api/reports/admin/all
```
**Auth:** Admin Required

### Update Report Status (Admin)
```
PATCH /api/reports/:reportId/status
```
**Auth:** Admin Required  
**Body:**
```json
{
  "status": "string (open|in_progress|resolved, required)"
}
```

### Update Report Severity (Admin)
```
PATCH /api/reports/:reportId/severity
```
**Auth:** Admin Required  
**Body:**
```json
{
  "severity": "string (low|medium|high|critical, required)"
}
```

### Get Reports by Severity (Admin)
```
GET /api/reports/severity/:severity
```
**Auth:** Admin Required

### Get Reports by Status (Admin)
```
GET /api/reports/status/:status
```
**Auth:** Admin Required

---

## Admin Dashboard Endpoints

### Get Overview Stats
```
GET /api/admin/overview
```
**Auth:** Admin Required

### Get All Users
```
GET /api/admin/users
```
**Auth:** Admin Required  
**Query Params:** `status`, `limit`, `offset`

### Get User Details
```
GET /api/admin/users/:userId
```
**Auth:** Admin Required

### Block User
```
PATCH /api/admin/users/:userId/block
```
**Auth:** Admin Required

### Unblock User
```
PATCH /api/admin/users/:userId/unblock
```
**Auth:** Admin Required

### Delete User
```
DELETE /api/admin/users/:userId
```
**Auth:** Admin Required

### Get All QR Codes
```
GET /api/admin/qr-codes
```
**Auth:** Admin Required  
**Query Params:** `status`, `limit`, `offset`

### Get QR Code Details
```
GET /api/admin/qr-codes/:qrCodeId
```
**Auth:** Admin Required

### Bulk Create QR Codes
```
POST /api/admin/qr-codes/bulk-create
```
**Auth:** Admin Required  
**Body:**
```json
{
  "count": "number (1-2000, required)"
}
```

### Assign QR Code
```
POST /api/admin/qr-codes/:qrCodeId/assign
```
**Auth:** Admin Required  
**Body:**
```json
{
  "userId": "uuid (required)"
}
```

### Revoke QR Code
```
PATCH /api/admin/qr-codes/:qrCodeId/revoke
```
**Auth:** Admin Required

### Get Call History
```
GET /api/admin/calls
```
**Auth:** Admin Required  
**Query Params:** `status`, `startDate`, `endDate`, `limit`, `offset`

### Get Call Details
```
GET /api/admin/calls/:callId
```
**Auth:** Admin Required

### Get Chat History
```
GET /api/admin/chats
```
**Auth:** Admin Required  
**Query Params:** `status`, `startDate`, `endDate`, `limit`, `offset`

### Get Chat Details
```
GET /api/admin/chats/:chatId
```
**Auth:** Admin Required

### Get Call Analytics
```
GET /api/admin/analytics/calls
```
**Auth:** Admin Required  
**Query Params:** `days` (default: 30)

### Get Chat Analytics
```
GET /api/admin/analytics/chats
```
**Auth:** Admin Required  
**Query Params:** `days` (default: 30)

### Get User Growth Analytics
```
GET /api/admin/analytics/user-growth
```
**Auth:** Admin Required  
**Query Params:** `days` (default: 30)

### Get All Bug Reports
```
GET /api/admin/bug-reports
```
**Auth:** Admin Required  
**Query Params:** `status`, `severity`, `limit`, `offset`

### Get Bug Report Stats
```
GET /api/admin/bug-reports/stats
```
**Auth:** Admin Required

### Get All Subscriptions
```
GET /api/admin/subscriptions
```
**Auth:** Admin Required  
**Query Params:** `plan`, `status`, `limit`, `offset`

### Get Subscription Stats
```
GET /api/admin/subscriptions/stats
```
**Auth:** Admin Required

### Get Active Calls (Monitoring)
```
GET /api/admin/monitoring/active-calls
```
**Auth:** Admin Required

### Get Active Chats (Monitoring)
```
GET /api/admin/monitoring/active-chats
```
**Auth:** Admin Required

### Get Recent Activity
```
GET /api/admin/monitoring/recent-activity
```
**Auth:** Admin Required  
**Query Params:** `limit` (default: 100)

### Get System Health
```
GET /api/admin/monitoring/system-health
```
**Auth:** Admin Required

### Export Users
```
GET /api/admin/export/users
```
**Auth:** Admin Required  
**Response:** JSON

### Export QR Codes
```
GET /api/admin/export/qr-codes
```
**Auth:** Admin Required  
**Response:** JSON

### Export Call History
```
GET /api/admin/export/call-history
```
**Auth:** Admin Required  
**Query Params:** `startDate`, `endDate`  
**Response:** JSON

### Export Chat History
```
GET /api/admin/export/chat-history
```
**Auth:** Admin Required  
**Query Params:** `startDate`, `endDate`  
**Response:** JSON

### Generate User Growth Report
```
GET /api/admin/reports/user-growth
```
**Auth:** Admin Required  
**Query Params:** `days` (default: 30)

---

## WebRTC Configuration Endpoint

### Get WebRTC Config
```
GET /api/webrtc/config
```
**Auth:** Required  
**Response:** STUN/TURN server configuration

---

## System Endpoints

### Health Check
```
GET /healthz
```
**Auth:** Not Required  
**Response:**
```json
{
  "status": "ok",
  "timestamp": "ISO date",
  "uptime": "number (seconds)",
  "environment": "string"
}
```

### API Documentation
```
GET /api-docs
```
**Auth:** Not Required  
**Response:** Swagger UI

---

## Response Format

All API responses follow this format:

**Success:**
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { /* response data */ }
}
```

**Error:**
```json
{
  "success": false,
  "message": "Error message",
  "stack": "Error stack trace (development only)"
}
```

## HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Too Many Requests (Rate Limited)
- `500` - Internal Server Error

---

## Rate Limiting

Default limits:
- Window: 15 minutes
- Max requests: 100 per window

Exceeded limits return `429 Too Many Requests`.

---

For detailed workflow examples, see [WORKFLOW.md](WORKFLOW.md).
