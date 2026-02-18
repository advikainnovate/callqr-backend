# Backend API Workflow Guide

Complete guide to all backend endpoints and workflows for the Privacy-Preserving QR-Based Calling System.

## Table of Contents
- [Authentication Flow](#authentication-flow)
- [User Management](#user-management)
- [QR Code Lifecycle](#qr-code-lifecycle)
- [Call Workflow](#call-workflow)
- [Chat Workflow](#chat-workflow)
- [Subscription Management](#subscription-management)
- [Bug Reporting](#bug-reporting)
- [Admin Operations](#admin-operations)
- [WebRTC Configuration](#webrtc-configuration)

---

## Authentication Flow

### 1. User Registration
**Endpoint:** `POST /api/auth/register`

**Request:**
```json
{
  "username": "johndoe",
  "password": "securePassword123",
  "phone": "+1234567890",
  "email": "john@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid",
      "username": "johndoe",
      "status": "active",
      "createdAt": "2026-02-18T10:00:00Z"
    }
  }
}
```

**Notes:**
- Phone and email are optional but recommended
- Phone/email are hashed (SHA-256) before storage
- Auto-creates a FREE subscription plan
- Returns JWT token for immediate use

### 2. User Login
**Endpoint:** `POST /api/auth/login`

**Request:**
```json
{
  "username": "johndoe",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid",
      "username": "johndoe",
      "status": "active",
      "createdAt": "2026-02-18T10:00:00Z"
    }
  }
}
```

**Notes:**
- Token expires based on JWT_SECRET configuration
- Use token in Authorization header: `Bearer <token>`

### 3. Get User Profile
**Endpoint:** `GET /api/auth/profile`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "johndoe",
    "status": "active",
    "createdAt": "2026-02-18T10:00:00Z",
    "updatedAt": "2026-02-18T10:00:00Z"
  }
}
```

### 4. Change Password
**Endpoint:** `POST /api/auth/change-password`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "oldPassword": "securePassword123",
  "newPassword": "newSecurePassword456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

---

## User Management

### 1. Get User by ID
**Endpoint:** `GET /api/users/:userId`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "johndoe",
    "status": "active",
    "createdAt": "2026-02-18T10:00:00Z"
  }
}
```

### 2. Update User
**Endpoint:** `PATCH /api/users/:userId`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "phone": "+9876543210",
  "email": "newemail@example.com"
}
```

### 3. Block User (Admin Only)
**Endpoint:** `PATCH /api/users/:userId/block`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "message": "User blocked successfully"
}
```

### 4. Activate User (Admin Only)
**Endpoint:** `PATCH /api/users/:userId/activate`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "message": "User activated successfully"
}
```

### 5. Delete User (Admin Only)
**Endpoint:** `DELETE /api/users/:userId`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "message": "User deleted successfully"
}
```

**Notes:**
- Soft delete - user marked as deleted but not removed from database

### 6. Verify Phone
**Endpoint:** `POST /api/users/verify/phone`

**Request:**
```json
{
  "phone": "+1234567890",
  "code": "123456"
}
```

### 7. Verify Email
**Endpoint:** `POST /api/users/verify/email`

**Request:**
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

---

## QR Code Lifecycle

### 1. Create Single QR Code (Admin)
**Endpoint:** `POST /api/qr-codes/create`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Request:**
```json
{
  "userId": "uuid-optional"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "token": "64-char-hex-token",
    "humanToken": "QR-K9F7-M2QX",
    "status": "unassigned",
    "createdAt": "2026-02-18T10:00:00Z"
  }
}
```

### 2. Bulk Create QR Codes (Admin)
**Endpoint:** `POST /api/qr-codes/bulk-create`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Request:**
```json
{
  "count": 100
}
```

**Response:**
```json
{
  "success": true,
  "message": "100 QR codes created successfully",
  "data": {
    "created": 100,
    "qrCodes": [...]
  }
}
```

**Notes:**
- Maximum 2000 QR codes per request
- All codes created as unassigned

### 3. Claim QR Code (User)
**Endpoint:** `POST /api/qr-codes/claim`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "humanToken": "QR-K9F7-M2QX"
}
```

**Response:**
```json
{
  "success": true,
  "message": "QR code claimed successfully",
  "data": {
    "id": "uuid",
    "token": "64-char-hex-token",
    "humanToken": "QR-K9F7-M2QX",
    "status": "active",
    "assignedUserId": "uuid",
    "assignedAt": "2026-02-18T10:00:00Z"
  }
}
```

### 4. Assign QR Code (Admin)
**Endpoint:** `POST /api/qr-codes/:qrCodeId/assign`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Request:**
```json
{
  "userId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "QR code assigned successfully"
}
```

### 5. Scan QR Code
**Endpoint:** `POST /api/qr-codes/scan`

**Request:**
```json
{
  "token": "64-char-hex-token"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "qrCodeId": "uuid",
    "user": {
      "id": "uuid",
      "username": "johndoe",
      "status": "active"
    }
  }
}
```

**Notes:**
- No authentication required
- Returns only non-sensitive user data
- Used before initiating call or chat

### 6. Get My QR Codes
**Endpoint:** `GET /api/qr-codes/my-codes`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "humanToken": "QR-K9F7-M2QX",
      "status": "active",
      "assignedAt": "2026-02-18T10:00:00Z"
    }
  ]
}
```

### 7. Get Unassigned QR Codes (Admin)
**Endpoint:** `GET /api/qr-codes/unassigned`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "humanToken": "QR-ABC1-XYZ9",
      "status": "unassigned",
      "createdAt": "2026-02-18T10:00:00Z"
    }
  ]
}
```

### 8. Get QR Code Image
**Endpoint:** `GET /api/qr-codes/image/:token`

**Response:**
- PNG image of QR code
- Content-Type: image/png

### 9. Revoke QR Code
**Endpoint:** `PATCH /api/qr-codes/:qrCodeId/revoke`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "QR code revoked successfully"
}
```

**Notes:**
- Permanently revokes QR code
- Cannot be reactivated

### 10. Disable QR Code
**Endpoint:** `PATCH /api/qr-codes/:qrCodeId/disable`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "QR code disabled successfully"
}
```

**Notes:**
- Temporarily disables QR code
- Can be reactivated later

### 11. Reactivate QR Code
**Endpoint:** `PATCH /api/qr-codes/:qrCodeId/reactivate`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "QR code reactivated successfully"
}
```

---

## Call Workflow

### Complete Call Flow
```
1. Scan QR Code → POST /api/qr-codes/scan
2. Initiate Call → POST /api/calls/initiate
3. Socket.IO: incoming-call event to receiver
4. Accept/Reject → PATCH /api/calls/:callId/accept or /reject
5. WebRTC Signaling → Socket.IO events (offer, answer, ice-candidate)
6. End Call → PATCH /api/calls/:callId/end
```

### 1. Initiate Call
**Endpoint:** `POST /api/calls/initiate`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "qrToken": "64-char-hex-token",
  "callType": "video"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "callId": "uuid",
    "callerId": "uuid",
    "receiverId": "uuid",
    "status": "initiated",
    "callType": "video",
    "startedAt": "2026-02-18T10:00:00Z"
  }
}
```

**Notes:**
- callType: "audio" or "video"
- Triggers Socket.IO "incoming-call" event to receiver

### 2. Accept Call
**Endpoint:** `PATCH /api/calls/:callId/accept`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Call accepted",
  "data": {
    "callId": "uuid",
    "status": "connected"
  }
}
```

### 3. Reject Call
**Endpoint:** `PATCH /api/calls/:callId/reject`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Call rejected",
  "data": {
    "callId": "uuid",
    "status": "ended",
    "endedReason": "rejected"
  }
}
```

### 4. Update Call Status
**Endpoint:** `PATCH /api/calls/:callId/status`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "status": "ringing"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Call status updated"
}
```

**Valid Statuses:**
- initiated
- ringing
- connected
- ended
- failed

### 5. End Call
**Endpoint:** `PATCH /api/calls/:callId/end`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "reason": "completed"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Call ended"
}
```

### 6. Get Call Details
**Endpoint:** `GET /api/calls/:callId`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "callerId": "uuid",
    "receiverId": "uuid",
    "status": "ended",
    "callType": "video",
    "endedReason": "completed",
    "startedAt": "2026-02-18T10:00:00Z",
    "endedAt": "2026-02-18T10:15:00Z"
  }
}
```

### 7. Get Call History
**Endpoint:** `GET /api/calls/history/all`

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- limit (default: 50)
- offset (default: 0)

**Response:**
```json
{
  "success": true,
  "data": {
    "calls": [...],
    "total": 150,
    "limit": 50,
    "offset": 0
  }
}
```

### 8. Get Active Calls
**Endpoint:** `GET /api/calls/active/list`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "callerId": "uuid",
      "receiverId": "uuid",
      "status": "connected",
      "startedAt": "2026-02-18T10:00:00Z"
    }
  ]
}
```

### 9. Get Call Usage Stats
**Endpoint:** `GET /api/calls/usage/stats`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "dailyCallsUsed": 5,
    "dailyCallsLimit": 20,
    "remainingCalls": 15
  }
}
```

---

## Chat Workflow

### Complete Chat Flow
```
1. Scan QR Code → POST /api/qr-codes/scan
2. Initiate Chat → POST /api/chat-sessions/initiate
3. Join Chat Room → Socket.IO: join-chat event
4. Send Messages → POST /api/messages/send + Socket.IO: chat-message
5. Receive Messages → Socket.IO: new-message event
6. Typing Indicators → Socket.IO: typing-start/typing-stop
7. Mark as Read → PATCH /api/messages/:messageId/read
8. End Chat → PATCH /api/chat-sessions/:chatSessionId/end
```

### 1. Initiate Chat Session
**Endpoint:** `POST /api/chat-sessions/initiate`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "qrToken": "64-char-hex-token"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "chatSessionId": "uuid",
    "participant1Id": "uuid",
    "participant2Id": "uuid",
    "status": "active",
    "startedAt": "2026-02-18T10:00:00Z"
  }
}
```

### 2. Get Chat Session Details
**Endpoint:** `GET /api/chat-sessions/:chatSessionId`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "participant1Id": "uuid",
    "participant2Id": "uuid",
    "status": "active",
    "startedAt": "2026-02-18T10:00:00Z",
    "lastMessageAt": "2026-02-18T10:05:00Z"
  }
}
```

### 3. Get My Chat Sessions
**Endpoint:** `GET /api/chat-sessions/my/all`

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- limit (default: 50)
- offset (default: 0)

**Response:**
```json
{
  "success": true,
  "data": {
    "chats": [...],
    "total": 25,
    "limit": 50,
    "offset": 0
  }
}
```

### 4. Get Active Chat Sessions
**Endpoint:** `GET /api/chat-sessions/active/list`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "participant1Id": "uuid",
      "participant2Id": "uuid",
      "status": "active",
      "lastMessageAt": "2026-02-18T10:05:00Z"
    }
  ]
}
```

### 5. End Chat Session
**Endpoint:** `PATCH /api/chat-sessions/:chatSessionId/end`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Chat session ended"
}
```

### 6. Block Chat Session
**Endpoint:** `PATCH /api/chat-sessions/:chatSessionId/block`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Chat session blocked"
}
```

### 7. Send Message
**Endpoint:** `POST /api/messages/send`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "chatSessionId": "uuid",
  "content": "Hello, how are you?",
  "messageType": "text"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "messageId": "uuid",
    "chatSessionId": "uuid",
    "senderId": "uuid",
    "content": "Hello, how are you?",
    "messageType": "text",
    "sentAt": "2026-02-18T10:00:00Z"
  }
}
```

**Notes:**
- messageType: "text", "image", "file", "system"
- Triggers Socket.IO "new-message" event

### 8. Get Messages
**Endpoint:** `GET /api/messages/:chatSessionId`

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- limit (default: 50)
- offset (default: 0)

**Response:**
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "id": "uuid",
        "senderId": "uuid",
        "content": "Hello!",
        "messageType": "text",
        "isRead": false,
        "sentAt": "2026-02-18T10:00:00Z"
      }
    ],
    "total": 100,
    "limit": 50,
    "offset": 0
  }
}
```

### 9. Mark Message as Read
**Endpoint:** `PATCH /api/messages/:messageId/read`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Message marked as read"
}
```

### 10. Mark Chat as Read
**Endpoint:** `PATCH /api/messages/chat/:chatSessionId/read`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "All messages marked as read"
}
```

### 11. Delete Message
**Endpoint:** `DELETE /api/messages/:messageId`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Message deleted"
}
```

**Notes:**
- Soft delete - message marked as deleted
- Only sender can delete their own messages

### 12. Get Unread Count
**Endpoint:** `GET /api/messages/unread/count`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "unreadCount": 15
  }
}
```

### 13. Search Messages
**Endpoint:** `GET /api/messages/:chatSessionId/search`

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- query (required): search term

**Response:**
```json
{
  "success": true,
  "data": {
    "messages": [...],
    "total": 5
  }
}
```

---

## Subscription Management

### Subscription Tiers
| Plan | Daily Calls | Daily Messages | Active Chats |
|------|-------------|----------------|--------------|
| Free | 20 | 100 | 5 |
| Pro | 80 | 500 | 20 |
| Enterprise | 200 | Unlimited | Unlimited |

### 1. Create Subscription (Admin)
**Endpoint:** `POST /api/subscriptions`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Request:**
```json
{
  "userId": "uuid",
  "plan": "pro",
  "expiresAt": "2027-02-18T10:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "plan": "pro",
    "status": "active",
    "startedAt": "2026-02-18T10:00:00Z",
    "expiresAt": "2027-02-18T10:00:00Z"
  }
}
```

### 2. Get Active Subscription
**Endpoint:** `GET /api/subscriptions/active`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "plan": "free",
    "status": "active",
    "startedAt": "2026-02-18T10:00:00Z",
    "expiresAt": null
  }
}
```

### 3. Get Subscription History
**Endpoint:** `GET /api/subscriptions/history`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "plan": "pro",
      "status": "expired",
      "startedAt": "2025-02-18T10:00:00Z",
      "expiresAt": "2026-02-18T10:00:00Z"
    }
  ]
}
```

### 4. Get User Plan
**Endpoint:** `GET /api/subscriptions/plan`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "plan": "free",
    "limits": {
      "dailyCalls": 20,
      "dailyMessages": 100,
      "activeChats": 5
    }
  }
}
```

### 5. Get Call Usage
**Endpoint:** `GET /api/subscriptions/usage`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "dailyCallsUsed": 5,
    "dailyCallsLimit": 20,
    "dailyMessagesUsed": 30,
    "dailyMessagesLimit": 100,
    "activeChats": 2,
    "activeChatLimit": 5
  }
}
```

### 6. Upgrade Plan
**Endpoint:** `POST /api/subscriptions/upgrade`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "plan": "pro"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Subscription upgraded successfully",
  "data": {
    "plan": "pro",
    "status": "active"
  }
}
```

### 7. Cancel Subscription
**Endpoint:** `DELETE /api/subscriptions/:subscriptionId`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Subscription canceled successfully"
}
```

---

## Bug Reporting

### 1. Create Bug Report
**Endpoint:** `POST /api/reports`

**Request (Anonymous):**
```json
{
  "description": "App crashes when uploading images",
  "severity": "high"
}
```

**Request (Authenticated):**
```json
{
  "description": "App crashes when uploading images",
  "severity": "high"
}
```

**Headers (Optional):**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "uuid-or-null",
    "description": "App crashes when uploading images",
    "severity": "high",
    "status": "pending",
    "createdAt": "2026-02-18T10:00:00Z"
  }
}
```

**Notes:**
- severity: "low", "medium", "high", "critical"
- status: "pending", "in_progress", "resolved", "closed"
- Can be submitted anonymously (no auth token)

### 2. Get Bug Report
**Endpoint:** `GET /api/reports/:reportId`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "description": "App crashes when uploading images",
    "severity": "high",
    "status": "in_progress",
    "createdAt": "2026-02-18T10:00:00Z"
  }
}
```

### 3. Get My Bug Reports
**Endpoint:** `GET /api/reports/my/all`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [...]
}
```

### 4. Get All Bug Reports (Admin)
**Endpoint:** `GET /api/reports/admin/all`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "data": [...]
}
```

### 5. Update Report Status (Admin)
**Endpoint:** `PATCH /api/reports/:reportId/status`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Request:**
```json
{
  "status": "in_progress"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Report status updated"
}
```

### 6. Update Report Severity (Admin)
**Endpoint:** `PATCH /api/reports/:reportId/severity`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Request:**
```json
{
  "severity": "critical"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Report severity updated"
}
```

### 7. Get Reports by Severity (Admin)
**Endpoint:** `GET /api/reports/severity/:severity`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "data": [...]
}
```

### 8. Get Reports by Status (Admin)
**Endpoint:** `GET /api/reports/status/:status`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "data": [...]
}
```

---

## Admin Operations

### Overview & Stats

#### Get Overview Stats
**Endpoint:** `GET /api/admin/overview`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalUsers": 1500,
    "activeUsers": 1200,
    "blockedUsers": 50,
    "totalQRCodes": 2000,
    "assignedQRCodes": 1500,
    "totalCalls": 5000,
    "activeCalls": 10,
    "totalChats": 3000,
    "activeChats": 25
  }
}
```

### User Management

#### Get All Users
**Endpoint:** `GET /api/admin/users`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Query Parameters:**
- status: "active", "blocked", "deleted"
- limit (default: 50)
- offset (default: 0)

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [...],
    "total": 1500,
    "limit": 50,
    "offset": 0
  }
}
```

#### Get User Details
**Endpoint:** `GET /api/admin/users/:userId`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "johndoe",
    "status": "active",
    "createdAt": "2026-02-18T10:00:00Z",
    "subscription": {...},
    "qrCodes": [...],
    "callStats": {...}
  }
}
```

#### Block User
**Endpoint:** `PATCH /api/admin/users/:userId/block`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "message": "User blocked successfully"
}
```

#### Unblock User
**Endpoint:** `PATCH /api/admin/users/:userId/unblock`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "message": "User unblocked successfully"
}
```

#### Delete User
**Endpoint:** `DELETE /api/admin/users/:userId`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "message": "User deleted successfully"
}
```

### QR Code Management

#### Get All QR Codes
**Endpoint:** `GET /api/admin/qr-codes`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Query Parameters:**
- status: "unassigned", "active", "disabled", "revoked"
- limit (default: 50)
- offset (default: 0)

**Response:**
```json
{
  "success": true,
  "data": {
    "qrCodes": [...],
    "total": 2000,
    "limit": 50,
    "offset": 0
  }
}
```

#### Get QR Code Details
**Endpoint:** `GET /api/admin/qr-codes/:qrCodeId`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "humanToken": "QR-K9F7-M2QX",
    "status": "active",
    "assignedUser": {...},
    "scanCount": 50,
    "lastScannedAt": "2026-02-18T10:00:00Z"
  }
}
```

### Call & Chat History

#### Get Call History
**Endpoint:** `GET /api/admin/calls`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Query Parameters:**
- status: "initiated", "connected", "ended", "failed"
- startDate, endDate
- limit, offset

**Response:**
```json
{
  "success": true,
  "data": {
    "calls": [...],
    "total": 5000
  }
}
```

#### Get Call Details
**Endpoint:** `GET /api/admin/calls/:callId`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "caller": {...},
    "receiver": {...},
    "status": "ended",
    "duration": 900,
    "startedAt": "2026-02-18T10:00:00Z",
    "endedAt": "2026-02-18T10:15:00Z"
  }
}
```

#### Get Chat History
**Endpoint:** `GET /api/admin/chats`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Query Parameters:**
- status: "active", "ended", "blocked"
- startDate, endDate
- limit, offset

**Response:**
```json
{
  "success": true,
  "data": {
    "chats": [...],
    "total": 3000
  }
}
```

#### Get Chat Details
**Endpoint:** `GET /api/admin/chats/:chatId`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "participants": [...],
    "messageCount": 150,
    "status": "active",
    "startedAt": "2026-02-18T10:00:00Z"
  }
}
```

### Analytics

#### Get Call Analytics
**Endpoint:** `GET /api/admin/analytics/calls`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Query Parameters:**
- days (default: 30)

**Response:**
```json
{
  "success": true,
  "data": {
    "totalCalls": 5000,
    "successfulCalls": 4500,
    "failedCalls": 500,
    "averageDuration": 600,
    "callsByDay": [...]
  }
}
```

#### Get Chat Analytics
**Endpoint:** `GET /api/admin/analytics/chats`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Query Parameters:**
- days (default: 30)

**Response:**
```json
{
  "success": true,
  "data": {
    "totalChats": 3000,
    "totalMessages": 50000,
    "averageMessagesPerChat": 16.7,
    "chatsByDay": [...]
  }
}
```

#### Get User Growth Analytics
**Endpoint:** `GET /api/admin/analytics/user-growth`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Query Parameters:**
- days (default: 30)

**Response:**
```json
{
  "success": true,
  "data": {
    "totalUsers": 1500,
    "newUsers": 150,
    "growthRate": 11.1,
    "usersByDay": [...]
  }
}
```

### Bug Reports

#### Get All Bug Reports
**Endpoint:** `GET /api/admin/bug-reports`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Query Parameters:**
- status, severity, limit, offset

**Response:**
```json
{
  "success": true,
  "data": {
    "reports": [...],
    "total": 100
  }
}
```

#### Get Bug Report Stats
**Endpoint:** `GET /api/admin/bug-reports/stats`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 100,
    "pending": 30,
    "inProgress": 40,
    "resolved": 30,
    "bySeverity": {
      "low": 20,
      "medium": 40,
      "high": 30,
      "critical": 10
    }
  }
}
```

### Subscriptions

#### Get All Subscriptions
**Endpoint:** `GET /api/admin/subscriptions`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Query Parameters:**
- plan: "free", "pro", "enterprise"
- status: "active", "expired", "canceled"
- limit, offset

**Response:**
```json
{
  "success": true,
  "data": {
    "subscriptions": [...],
    "total": 1500
  }
}
```

#### Get Subscription Stats
**Endpoint:** `GET /api/admin/subscriptions/stats`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 1500,
    "byPlan": {
      "free": 1200,
      "pro": 250,
      "enterprise": 50
    },
    "revenue": {
      "monthly": 15000,
      "annual": 180000
    }
  }
}
```

### Real-Time Monitoring

#### Get Active Calls
**Endpoint:** `GET /api/admin/monitoring/active-calls`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "activeCalls": 10,
    "calls": [...]
  }
}
```

#### Get Active Chats
**Endpoint:** `GET /api/admin/monitoring/active-chats`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "activeChats": 25,
    "chats": [...]
  }
}
```

#### Get Recent Activity
**Endpoint:** `GET /api/admin/monitoring/recent-activity`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Query Parameters:**
- limit (default: 50)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "type": "user_registration",
      "userId": "uuid",
      "timestamp": "2026-02-18T10:00:00Z"
    },
    {
      "type": "call_initiated",
      "callId": "uuid",
      "timestamp": "2026-02-18T10:05:00Z"
    }
  ]
}
```

#### Get System Health
**Endpoint:** `GET /api/admin/monitoring/system-health`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 86400,
    "database": "connected",
    "socketIO": "active",
    "activeConnections": 150,
    "memoryUsage": {
      "used": 512,
      "total": 2048
    }
  }
}
```

### Export & Reports

#### Export Users
**Endpoint:** `GET /api/admin/export/users`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
- JSON file download with all user data

#### Export QR Codes
**Endpoint:** `GET /api/admin/export/qr-codes`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
- JSON file download with all QR code data

#### Export Call History
**Endpoint:** `GET /api/admin/export/call-history`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
- JSON file download with call history data

#### Export Chat History
**Endpoint:** `GET /api/admin/export/chat-history`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
- JSON file download with chat history data

#### Generate User Growth Report
**Endpoint:** `GET /api/admin/reports/user-growth`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Query Parameters:**
- days (default: 30)

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "30 days",
    "totalUsers": 1500,
    "newUsers": 150,
    "growthRate": 11.1,
    "dailyBreakdown": [...]
  }
}
```

---

## WebRTC Configuration

### Get WebRTC Config
**Endpoint:** `GET /api/webrtc/config`

**Response:**
```json
{
  "success": true,
  "data": {
    "iceServers": [
      {
        "urls": "stun:stun.l.google.com:19302"
      },
      {
        "urls": "turn:your-turn-server.com:3478",
        "username": "turn-user",
        "credential": "turn-password"
      }
    ]
  }
}
```

**Notes:**
- Returns STUN/TURN server configuration
- Used for WebRTC peer connection setup
- No authentication required

---

## Socket.IO Events

### Authentication
```javascript
const socket = io('https://api.yourdomain.com', {
  auth: { token: 'JWT_TOKEN' },
  transports: ['websocket']
});
```

### Call Events

#### Emit Events
```javascript
// Accept call
socket.emit('accept-call', { callId: 'uuid' });

// Reject call
socket.emit('reject-call', { callId: 'uuid' });

// End call
socket.emit('end-call', { callId: 'uuid' });

// WebRTC signaling
socket.emit('webrtc-signal', {
  type: 'offer',
  callId: 'uuid',
  targetUserId: 'uuid',
  data: rtcOffer
});
```

#### Listen Events
```javascript
// Incoming call notification
socket.on('incoming-call', (data) => {
  console.log('Call from:', data.callerId);
  console.log('Call ID:', data.callId);
  console.log('Call type:', data.callType);
});

// Call accepted
socket.on('call-accepted', (data) => {
  console.log('Call accepted:', data.callId);
});

// Call rejected
socket.on('call-rejected', (data) => {
  console.log('Call rejected:', data.callId);
});

// Call ended
socket.on('call-ended', (data) => {
  console.log('Call ended:', data.callId);
  console.log('Reason:', data.reason);
});

// WebRTC signaling
socket.on('webrtc-signal', (data) => {
  console.log('Signal type:', data.type);
  console.log('From user:', data.fromUserId);
  console.log('Data:', data.data);
});
```

### Chat Events

#### Emit Events
```javascript
// Join chat room
socket.emit('join-chat', { chatSessionId: 'uuid' });

// Leave chat room
socket.emit('leave-chat', { chatSessionId: 'uuid' });

// Send message (after creating via API)
socket.emit('chat-message', {
  chatSessionId: 'uuid',
  messageId: 'uuid'
});

// Typing indicators
socket.emit('typing-start', { chatSessionId: 'uuid' });
socket.emit('typing-stop', { chatSessionId: 'uuid' });

// Mark message as read
socket.emit('message-read', {
  chatSessionId: 'uuid',
  messageId: 'uuid'
});
```

#### Listen Events
```javascript
// New message received
socket.on('new-message', (data) => {
  console.log('Message ID:', data.messageId);
  console.log('From:', data.senderId);
  console.log('Content:', data.content);
  console.log('Chat:', data.chatSessionId);
});

// Message delivered confirmation
socket.on('message-delivered', (data) => {
  console.log('Message delivered:', data.messageId);
});

// Message read receipt
socket.on('message-read', (data) => {
  console.log('Message read:', data.messageId);
  console.log('Read by:', data.readBy);
});

// User typing indicator
socket.on('user-typing', (data) => {
  console.log('User typing:', data.userId);
  console.log('In chat:', data.chatSessionId);
});

// User stopped typing
socket.on('user-stopped-typing', (data) => {
  console.log('User stopped typing:', data.userId);
});

// Chat ended
socket.on('chat-ended', (data) => {
  console.log('Chat ended:', data.chatSessionId);
});
```

---

## Error Handling

### Standard Error Response
```json
{
  "success": false,
  "message": "Error description",
  "error": {
    "code": "ERROR_CODE",
    "details": "Additional error details"
  }
}
```

### Common Error Codes
- `401 Unauthorized` - Invalid or missing JWT token
- `403 Forbidden` - Insufficient permissions (admin required)
- `404 Not Found` - Resource not found
- `400 Bad Request` - Invalid request data
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

### Rate Limiting
- Default: 100 requests per 15 minutes per IP
- Configurable via environment variables
- Returns `429` status when exceeded

---

## Best Practices

### Authentication
1. Always include JWT token in Authorization header
2. Store token securely (not in localStorage for sensitive apps)
3. Handle token expiration gracefully
4. Refresh tokens before expiration

### WebRTC Calls
1. Get WebRTC config before establishing connection
2. Handle all call states (initiated, ringing, connected, ended)
3. Implement proper cleanup on call end
4. Use Socket.IO for real-time signaling
5. Handle network disconnections gracefully

### Chat Sessions
1. Join chat room via Socket.IO after initiating
2. Send messages via REST API, broadcast via Socket.IO
3. Implement typing indicators for better UX
4. Mark messages as read to update unread counts
5. Handle chat session end gracefully

### QR Codes
1. Generate QR codes in bulk for efficiency
2. Use human-readable tokens for user claiming
3. Implement proper QR code lifecycle management
4. Revoke compromised QR codes immediately
5. Monitor QR code usage and scan patterns

### Subscriptions
1. Check usage limits before operations
2. Handle subscription expiration gracefully
3. Implement upgrade/downgrade flows
4. Track usage statistics for billing
5. Notify users of approaching limits

### Admin Operations
1. Always verify admin permissions
2. Use pagination for large datasets
3. Implement proper filtering and search
4. Export data in manageable chunks
5. Monitor system health regularly

---

## Testing Workflow

### 1. Complete User Journey
```bash
# 1. Register
POST /api/auth/register

# 2. Login
POST /api/auth/login

# 3. Get profile
GET /api/auth/profile

# 4. Claim QR code
POST /api/qr-codes/claim

# 5. Get my QR codes
GET /api/qr-codes/my-codes

# 6. Check subscription
GET /api/subscriptions/active

# 7. Get usage stats
GET /api/subscriptions/usage
```

### 2. Call Flow Testing
```bash
# 1. Scan QR code
POST /api/qr-codes/scan

# 2. Initiate call
POST /api/calls/initiate

# 3. Accept call (as receiver)
PATCH /api/calls/:callId/accept

# 4. End call
PATCH /api/calls/:callId/end

# 5. Check call history
GET /api/calls/history/all
```

### 3. Chat Flow Testing
```bash
# 1. Scan QR code
POST /api/qr-codes/scan

# 2. Initiate chat
POST /api/chat-sessions/initiate

# 3. Send message
POST /api/messages/send

# 4. Get messages
GET /api/messages/:chatSessionId

# 5. Mark as read
PATCH /api/messages/:messageId/read

# 6. End chat
PATCH /api/chat-sessions/:chatSessionId/end
```

---

## Environment Variables

```env
# Server
PORT=4000
NODE_ENV=production

# Database
DATABASE_URL=postgres://user:pass@host:5432/db

# Security
JWT_SECRET=your-secret-key-min-32-chars
ENCRYPTION_KEY=your-32-byte-hex-key

# Admin
ADMIN_USER_IDS=uuid1,uuid2,uuid3

# CORS
ALLOWED_ORIGINS=https://yourdomain.com

# WebRTC
STUN_SERVER=stun:stun.l.google.com:19302
TURN_SERVER=turn:your-turn.com:3478
TURN_USERNAME=username
TURN_PASSWORD=password

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

---

**For more details, see:**
- [Main README](README.md)
- [Frontend Integration Guide](FRONTEND_README.md)
- [API Documentation](http://localhost:4000/api-docs)
