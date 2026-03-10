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
  "password": "string (required, min 6 chars)",
  "phone": "string (required, E.164 format)",
  "email": "string (optional)"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Registration successful. Please verify your phone number.",
  "data": {
    "token": "jwt_token",
    "user": {
      "id": "user_id",
      "username": "username",
      "status": "pending_verification",
      "isPhoneVerified": false,
      "createdAt": "timestamp"
    },
    "message": "An OTP has been sent to your phone number. Please verify to activate your account."
  }
}
```
**Note:** 
- Phone number is now REQUIRED for registration
- OTP is sent immediately after registration
- User must verify phone before they can login
- Account status is `pending_verification` until phone is verified

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

**Note:**
- Login is blocked if phone is not verified
- Users with `pending_verification` status cannot login
- Error response if unverified:
```json
{
  "success": false,
  "message": "Please verify your phone number before logging in",
  "data": {
    "userId": "user_id",
    "isPhoneVerified": false,
    "hint": "Use POST /api/auth/resend-phone-verification to get a new OTP"
  }
}
```
{
  "username": "string (required)",
  "password": "string (required)"
}
```
**Response:** JWT token + user data

### Forgot Password (Request OTP)
```
POST /api/auth/forgot-password
```
**Body:**
```json
{
  "username": "string (required)"
}
```
**Response:**
```json
{
  "success": true,
  "message": "OTP sent to your registered phone number.",
  "data": {
    "message": "An OTP has been sent to your phone. Use it to reset your password.",
    "userId": "user_id"
  }
}
```
**Note:** 
- Requires verified phone number
- OTP sent via SMS to registered phone
- OTP expires in 10 minutes
- User ID needed for reset password step

### Reset Password (Verify OTP & Set New Password)
```
POST /api/auth/reset-password
```
**Body:**
```json
{
  "userId": "string (required)",
  "otp": "string (required, 6 digits)",
  "newPassword": "string (required, min 6 chars)"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Password reset successful. You can now login with your new password.",
  "data": null
}
```
**Note:**
- Must provide valid OTP from SMS
- OTP is verified before password change
- Old password is replaced with new one

### Send Phone Verification OTP
```
POST /api/auth/send-phone-verification
```
**Auth:** Required (Bearer token)

**Body:**
```json
{
  "phone": "string (required, min 10 digits)"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Verification code sent to your phone"
}
```
**Note:** OTP expires in 10 minutes. In development mode (without Twilio configured), OTP is logged to console.

### Verify Phone Number
```
POST /api/auth/verify-phone
```
**Auth:** Required (Bearer token)

**Body:**
```json
{
  "otp": "string (required, 6 digits)"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Phone number verified successfully"
}
```

### Resend Phone Verification OTP
```
POST /api/auth/resend-phone-verification
```
**Auth:** Required (Bearer token)

**Response:**
```json
{
  "success": true,
  "message": "Verification code resent to your phone"
}
```

### Get Phone Verification Status
```
GET /api/auth/phone-verification-status
```
**Auth:** Required (Bearer token)

**Response:**
```json
{
  "success": true,
  "data": {
    "hasPhone": true,
    "isPhoneVerified": true,
    "phone": "+12****7890"
  }
}
```

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

### Global Block User (Admin)
```
POST /api/admin/users/:userId/global-block
```
**Auth:** Admin Required  
**Body:**
```json
{
  "reason": "string (required, 1-500 chars)"
}
```
**Response:**
```json
{
  "success": true,
  "message": "User globally blocked successfully",
  "data": {
    "id": "uuid",
    "username": "string",
    "status": "blocked",
    "isGloballyBlocked": "true",
    "globalBlockReason": "string",
    "globalBlockedAt": "ISO date",
    "globalBlockedBy": "admin-uuid"
  }
}
```
**Note:** Globally blocked users cannot login or access any API endpoints.

### Global Unblock User (Admin)
```
POST /api/admin/users/:userId/global-unblock
```
**Auth:** Admin Required

### Get Globally Blocked Users (Admin)
```
GET /api/admin/users/global-blocked/list
```
**Auth:** Admin Required  
**Query Params:** `limit` (default: 100), `offset` (default: 0)

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

### Send Text Message
```
POST /api/messages
```
**Auth:** Required  
**Content-Type:** application/json  
**Body:**
```json
{
  "chatSessionId": "uuid (required)",
  "content": "string (required, max 5000 chars)",
  "messageType": "text (default)"
}
```

### Send Image Message
```
POST /api/messages
```
**Auth:** Required  
**Content-Type:** multipart/form-data  
**Form Data:**
```
chatSessionId: "uuid (required)"
messageType: "image (required)"
content: "string (optional, caption text)"
images: File[] (required, max 5 files)
```

**File Requirements:**
- Max 5 images per message
- Max 5MB per image
- Max 10MB total per message
- Supported formats: JPG, JPEG, PNG, GIF, WebP
- Automatic compression to 1-2MB
- WebP conversion for optimization

**Response:**
```json
{
  "success": true,
  "message": "Message sent successfully",
  "data": {
    "id": "uuid",
    "chatSessionId": "uuid",
    "senderId": "uuid",
    "messageType": "image",
    "content": "Optional caption",
    "mediaAttachments": [
      {
        "publicId": "callqr/messages/user123_1640995200000_abc123",
        "url": "https://res.cloudinary.com/cloud/image/upload/v123/...",
        "secureUrl": "https://res.cloudinary.com/cloud/image/upload/v123/...",
        "width": 1200,
        "height": 800,
        "format": "webp",
        "bytes": 156789,
        "originalFilename": "photo.jpg",
        "thumbnailUrl": "https://res.cloudinary.com/cloud/image/upload/w_150,h_150,c_fill,f_webp,q_auto/..."
      }
    ],
    "isRead": false,
    "sentAt": "2024-01-01T12:00:00.000Z"
  }
}
```

**Rate Limits:**
- Free plan: 50 messages/day
- Pro plan: 500 messages/day
- Enterprise: Unlimited

### Get Messages
```
GET /api/messages/:chatSessionId
```
**Auth:** Required  
**Query Params:** `limit` (default: 50, max: 100), `offset` (default: 0)  
**Response:**
```json
{
  "success": true,
  "message": "Messages retrieved successfully",
  "data": {
    "messages": [
      {
        "id": "uuid",
        "chatSessionId": "uuid",
        "senderId": "uuid",
        "messageType": "text|image|file|system",
        "content": "string",
        "mediaAttachments": [
          {
            "publicId": "string",
            "url": "string",
            "secureUrl": "string",
            "width": "number",
            "height": "number",
            "format": "string",
            "bytes": "number",
            "originalFilename": "string",
            "thumbnailUrl": "string"
          }
        ],
        "isRead": "boolean",
        "sentAt": "ISO date",
        "readAt": "ISO date | null"
      }
    ],
    "pagination": {
      "limit": "number",
      "offset": "number",
      "count": "number"
    }
  }
}
```

**Note:** Returns only messages from chats where the authenticated user is a participant. Media attachments include multiple optimized image sizes.

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
GET /api/messages/unread/count
```
**Auth:** Required  
**Response:**
```json
{
  "success": true,
  "message": "Unread count retrieved successfully",
  "data": {
    "unreadCount": "number"
  }
}
```

**Note:** Returns total unread messages across all user's chat sessions (excluding own messages).

### Search Messages
```
GET /api/messages/:chatSessionId/search
```
**Auth:** Required  
**Query Params:** `query` (required)

### Media Upload Error Responses

**File Size Exceeded:**
```json
{
  "success": false,
  "message": "File size exceeds 5MB limit"
}
```

**Too Many Files:**
```json
{
  "success": false,
  "message": "Maximum 5 images allowed per message"
}
```

**Invalid Format:**
```json
{
  "success": false,
  "message": "Invalid file format. Allowed: jpg, jpeg, png, gif, webp"
}
```

**Total Size Exceeded:**
```json
{
  "success": false,
  "message": "Image validation failed: Total upload size exceeds 10MB limit"
}
```

**Rate Limit Exceeded:**
```json
{
  "success": false,
  "message": "Daily message limit reached for free plan (50/50)"
}
```

### Image URL Variants

Each uploaded image automatically generates multiple optimized versions:

```javascript
const imageUrls = {
  thumbnail: "w_150,h_150,c_fill,f_webp,q_auto",     // 150x150 cropped
  small: "w_300,h_300,c_limit,f_webp,q_auto",        // Max 300x300
  medium: "w_600,h_600,c_limit,f_webp,q_auto",       // Max 600x600  
  large: "w_1200,h_1200,c_limit,f_webp,q_auto",      // Max 1200x1200
  original: "" // No transformations
};
```

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
**Response:**
```json
{
  "success": true,
  "message": "Plan upgraded successfully",
  "data": {
    "id": "uuid",
    "plan": "pro",
    "status": "active",
    "startedAt": "ISO date",
    "expiresAt": "ISO date"
  }
}
```

### Downgrade Plan
```
POST /api/subscriptions/downgrade
```
**Auth:** Required  
**Body:**
```json
{
  "plan": "string (free|pro, required)"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Plan downgraded successfully",
  "data": {
    "id": "uuid",
    "plan": "free",
    "status": "active",
    "startedAt": "ISO date",
    "expiresAt": null,
    "message": "Your subscription has been downgraded. New limits will apply immediately."
  }
}
```
**Note:** Downgrade is only allowed if current usage doesn't exceed the new plan's limits. Use the check endpoint first.

### Check Downgrade Eligibility
```
GET /api/subscriptions/downgrade/check?plan=free
```
**Auth:** Required  
**Query Params:** `plan` (required: free|pro)  
**Response:**
```json
{
  "success": true,
  "message": "Downgrade eligibility checked",
  "data": {
    "eligible": true,
    "currentPlan": "pro",
    "targetPlan": "free",
    "warnings": [],
    "currentUsage": {
      "calls": { "used": 5, "newLimit": 20 },
      "messages": { "used": 30, "newLimit": 50 },
      "chats": { "active": 2, "newLimit": 5 }
    }
  }
}
```
**Response (Not Eligible):**
```json
{
  "success": true,
  "message": "Downgrade eligibility checked",
  "data": {
    "eligible": false,
    "currentPlan": "enterprise",
    "targetPlan": "free",
    "warnings": [
      "Current calls today (45) exceeds free limit (20)",
      "Current active chats (8) exceeds free limit (5)"
    ],
    "currentUsage": {
      "calls": { "used": 45, "newLimit": 20 },
      "messages": { "used": 120, "newLimit": 50 },
      "chats": { "active": 8, "newLimit": 5 }
    }
  }
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
  "status": "ok|degraded|error",
  "timestamp": "ISO date",
  "uptime": "number (seconds)",
  "environment": "string",
  "services": {
    "database": {
      "status": "connected|error",
      "details": "string"
    },
    "webrtc": {
      "status": "running|error", 
      "details": "string"
    },
    "cloudinary": {
      "status": "connected|warning|error",
      "details": "string"
    },
    "environment": {
      "status": "ok",
      "details": "string"
    }
  }
}
```

**Cloudinary Status:**
- `connected`: Media uploads fully functional
- `warning`: Credentials not configured (uploads disabled)
- `error`: Connection failed or invalid credentials

**HTTP Status Codes:**
- `200`: All services healthy
- `503`: One or more services degraded

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
