# QR Code System - Complete Guide

This document provides a comprehensive overview of how QR codes work in the CallQR application, from generation through scanning and lifecycle management.

## Table of Contents

1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [QR Code Generation](#qr-code-generation)
4. [QR Code Claiming & Assignment](#qr-code-claiming--assignment)
5. [QR Code Scanning & Validation](#qr-code-scanning--validation)
6. [QR Code Image Generation](#qr-code-image-generation)
7. [Lifecycle Management](#lifecycle-management)
8. [Batch Management](#batch-management)
9. [API Endpoints](#api-endpoints)
10. [Status Transitions](#status-transitions)
11. [Business Rules](#business-rules)
12. [Error Handling](#error-handling)

---

## Overview

The QR code system is a core feature of CallQR that enables users to share their contact information via physical or digital QR codes. The system handles:

- **Generation**: Creating QR code batches with unique tokens
- **Distribution**: Assigning QR codes to users
- **Scanning**: Resolving QR codes and providing user information to scanners
- **Lifecycle**: Managing QR code status (active, disabled, revoked)
- **Notifications**: Real-time push notifications when QR is scanned

### Token Types

QR codes use two token formats:

1. **Secure Token** (64-character hex string)
   - Generated cryptographically using `crypto.randomBytes(32).toString('hex')`
   - Used internally and in URLs
   - Example: `a1b2c3d4e5f6...` (64 hex chars)

2. **Human Token** (QR-XXXX-XXXX format)
   - User-friendly format for manual entry
   - Excludes confusing characters: 0, O, 1, I, L
   - Valid characters: 2-9, A-Z
   - Example: `QR-A7BK-M9XZ`
   - Unique guarantee: 10 retry attempts to ensure uniqueness

---

## Database Schema

### QR Codes Table

```sql
CREATE TABLE qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(255) NOT NULL UNIQUE,          -- 64-char hex token
  human_token VARCHAR(20) NOT NULL UNIQUE,     -- QR-XXXX-XXXX format
  assigned_user_id UUID REFERENCES users(id),  -- NULL if unassigned
  batch_id UUID NOT NULL REFERENCES qr_batches(id),
  status VARCHAR(20) DEFAULT 'unassigned',     -- See status enum below
  created_at TIMESTAMP DEFAULT NOW(),
  assigned_at TIMESTAMP,                       -- When user claimed/assigned

  CONSTRAINT status_enum CHECK (status IN ('unassigned', 'active', 'disabled', 'revoked'))
);

-- Indexes for performance
CREATE INDEX idx_qr_codes_token ON qr_codes(token);
CREATE INDEX idx_qr_codes_human_token ON qr_codes(human_token);
CREATE INDEX idx_qr_codes_assigned_user_id ON qr_codes(assigned_user_id);
CREATE INDEX idx_qr_codes_batch_id ON qr_codes(batch_id);
CREATE INDEX idx_qr_codes_status ON qr_codes(status);
```

### QR Batches Table

```sql
CREATE TABLE qr_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number VARCHAR(50) UNIQUE,            -- PR-250526-001 / DG-250526-002 format
  purpose VARCHAR(20) NOT NULL,               -- 'printing' or 'digital'
  status VARCHAR(30),                         -- See batch status rules below
  quantity INTEGER NOT NULL,                  -- How many QR codes in batch
  created_by UUID REFERENCES users(id),       -- Admin who created batch
  notes TEXT,                                 -- Admin notes
  print_job_ref VARCHAR(100),                 -- External print job reference
  distributed_at TIMESTAMP,                   -- When physical copies distributed
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_qr_batches_batch_number ON qr_batches(batch_number);
CREATE INDEX idx_qr_batches_purpose ON qr_batches(purpose);
CREATE INDEX idx_qr_batches_status ON qr_batches(status);
CREATE INDEX idx_qr_batches_created_by ON qr_batches(created_by);
```

### Status Enums

**QR Code Status**:

- `unassigned` - Created but not yet claimed or assigned to a user
- `active` - Assigned to a user and ready to be scanned
- `disabled` - Temporarily disabled by user (can be reactivated)
- `revoked` - Permanently revoked by user (cannot be reactivated)

**Batch Status (Purpose: 'printing')**:

- `generated` - Batch created, awaiting print job
- `print_pending` - Sent to print provider
- `printed` - Physical QR codes printed and ready
- `distributed` - Physical codes distributed to users

**Batch Status (Purpose: 'digital')**:

- `generated` - Batch created (no users assigned yet)
- `available` - Batch ready for users to claim (0% assigned)
- `partially_assigned` - Some QR codes claimed by users (0% < X < 100%)
- `fully_assigned` - All QR codes assigned to users (100%)

---

## QR Code Generation

### Single QR Code Creation

Generated QR codes are not yet assigned to any user and begin in `unassigned` status.

```typescript
// Internal method in qrCode.service.ts
private async createQRCodeRecord(batchId: string): Promise<QRCodeType> {
  const token = this.generateSecureToken();        // 64-char hex
  const humanToken = await this.ensureUniqueHumanToken();  // QR-XXXX-XXXX

  const [qrCode] = await db.insert(qrCodes).values({
    token,
    humanToken,
    batchId,
    status: 'unassigned',
  }).returning();

  return qrCode;
}
```

#### Token Generation

```typescript
// Generate secure cryptographic token
private generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');  // 64 hex characters
}

// Generate human-readable token
private generateHumanToken(): string {
  const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';  // Excludes: 0,O,1,I,L
  let token = 'QR-';

  // First 4 characters
  for (let i = 0; i < 4; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  token += '-';

  // Second 4 characters
  for (let i = 0; i < 4; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return token;  // e.g., "QR-A7BK-M9XZ"
}

// Ensure uniqueness with retry logic
private async ensureUniqueHumanToken(): Promise<string> {
  let attempts = 0;
  while (attempts < 10) {
    const humanToken = this.generateHumanToken();
    const existing = await db.select().from(qrCodes)
      .where(eq(qrCodes.humanToken, humanToken));

    if (!existing.length) {
      return humanToken;  // Unique token found
    }

    attempts++;
  }

  throw new Error('Failed to generate unique human token after 10 attempts');
}
```

### Batch Generation

Batches can be created for two purposes: physical printing or digital distribution.

```typescript
async createQRCodeBatch(input: {
  count: number;              // Must be: 10, 25, 50, 100, 200, 500, or 1000
  purpose: 'printing' | 'digital';
  createdBy?: string;         // Admin user ID
  notes?: string;             // Admin notes
  printJobRef?: string;       // Reference to external print job
}): Promise<{ batch: QRBatch; qrCodes: QRCodeType[] }>
```

**Allowed Batch Counts**: 10, 25, 50, 100, 200, 500, 1000

**Batch Number Format**: `<TYPE>-<DDMMYY>-<3 digit running number>`

- `PR` for printing batches
- `DG` for digital batches
- Running number resets daily
- Running number is shared across all batches created on the same day

#### Batch Generation Process

1. Validate count is in allowed list
2. Generate unique batch number
3. Create batch record with status based on purpose:
   - **'printing'** → status: `'generated'`
   - **'digital'** → status: `'generated'` (auto-transitions to `available` once created)
4. Create individual QR code records linked to batch
5. Return batch metadata and QR codes

```typescript
// Example: Create batch of 50 digital QR codes
POST /api/admin/qr-codes/bulk-create
{
  "count": 50,
  "purpose": "digital",
  "notes": "Q2 2026 campaign batch"
}

Response:
{
  "batch": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "batchNumber": "DG-220526-001",
    "purpose": "digital",
    "status": "generated",
    "quantity": 50,
    "createdBy": "admin-user-id",
    "createdAt": "2026-05-22T14:30:00Z"
  },
  "qrCodes": [
    {
      "id": "...",
      "token": "a1b2c3d4e5f6...",
      "humanToken": "QR-B7NK-M2PQ",
      "batchId": "550e8400-e29b-41d4-a716-446655440000",
      "status": "unassigned",
      "createdAt": "2026-05-22T14:30:00Z"
    },
    // ... 49 more
  ]
}
```

### Batch Generation Script

For bulk generation outside the API:

```bash
node scripts/generate-qr-codes.js 100
```

This script:

1. Creates 100 QR code records
2. Generates unique tokens and human tokens for each
3. Sets status to `unassigned`
4. Returns created QR codes

---

## QR Code Claiming & Assignment

QR codes move from `unassigned` to `active` status when claimed by a user or assigned by an admin.

### User Claiming (Self-Service)

Users can claim unassigned QR codes that aren't assigned to anyone yet.

```typescript
async claimQRCode(
  userId: string,
  token?: string,           // 64-char hex token
  humanToken?: string       // QR-XXXX-XXXX format
): Promise<QRCodeType>
```

#### Claiming Process

1. **Validate Input**: Either `token` or `humanToken` must be provided
2. **Find QR Code**:
   - If `humanToken`: Normalize to uppercase and query
   - If `token`: Extract token and validate 64-hex format
3. **Verify Status**: QR must be in `unassigned` status
4. **Check User Limit**: User can only have 1 active/disabled QR
   - If user has existing active/disabled QR, reject with error
5. **Update QR Code**:
   - Set `assignedUserId` to user ID
   - Set `status` to `active`
   - Set `assignedAt` to current timestamp
6. **Refresh Batch Status**: Update batch status based on assignment counts
7. **Return**: Updated QR code record

#### Example: Claim via Human Token

```bash
POST /api/qr-codes/claim
Content-Type: application/json
Authorization: Bearer <user-token>

{
  "humanToken": "QR-A7BK-M9XZ"
}

Response (200 OK):
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "token": "a1b2c3d4e5f6...",
  "humanToken": "QR-A7BK-M9XZ",
  "assignedUserId": "user-id-123",
  "status": "active",
  "assignedAt": "2026-05-22T15:45:00Z",
  "createdAt": "2026-05-22T14:30:00Z"
}
```

#### Error Cases

```
// User already has active/disabled QR
400 Bad Request
"You already have an active QR code. Please revoke it first."

// QR not found
404 Not Found
"QR code not found"

// QR already claimed
400 Bad Request
"QR code is already claimed or not available"

// Invalid token format
400 Bad Request
"Invalid QR token format"
```

### Admin Assignment

Admins can assign unassigned QR codes directly to users.

```typescript
async assignQRCode(
  qrCodeId: string,
  userId: string
): Promise<QRCodeType>
```

#### Assignment Process

1. **Verify Target User**: User must exist and be in `active` status
2. **Verify QR Status**: QR must be in `unassigned` status
3. **Check User Limit**: Target user can only have 1 active/disabled QR
4. **Update QR Code**: Same as claiming process
5. **Refresh Batch Status**: Update batch status
6. **Return**: Updated QR code record

#### Example: Admin Assignment

```bash
POST /api/admin/qr-codes/550e8400-e29b-41d4-a716-446655440001/assign
Content-Type: application/json
Authorization: Bearer <admin-token>

{
  "userId": "user-id-456"
}

Response (200 OK):
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "token": "a1b2c3d4e5f6...",
  "humanToken": "QR-A7BK-M9XZ",
  "assignedUserId": "user-id-456",
  "status": "active",
  "assignedAt": "2026-05-22T15:50:00Z",
  "createdAt": "2026-05-22T14:30:00Z"
}
```

---

## QR Code Scanning & Validation

### How Scanning Works

When someone scans a QR code with their phone camera or a QR scanner app, they can access the QR code owner's information. The system handles three scenarios:

1. **Unassigned QR** → Redirect to home page
2. **Assigned QR (Third-party App)** → Redirect to contact page with owner info
3. **Assigned QR (Official App)** → Return JSON with owner details

### Scan Flow

```
QR Code Scan
    ↓
Validate Token/HumanToken
    ↓
QR Status Check
    ├─ unassigned → Redirect to home page
    ├─ revoked/disabled → Error
    └─ active → Continue
    ↓
Get Owner User Info
    ├─ User not active → Error
    └─ User active → Continue
    ↓
Check App Type
    ├─ Official App → Return JSON
    └─ Third-party → Redirect + Send Notification
    ↓
Log Scan Event
```

### Token Extraction & Validation

The system supports scanning from:

- Raw tokens pasted manually
- Full URLs containing the token
- QR code images (decoded by client)

```typescript
export function extractQRCodeToken(input: string): string | null {
  // Case 1: Raw 64-character hex token
  if (/^[a-fA-F0-9]{64}$/.test(input)) {
    return input;
  }

  // Case 2: Full URL - extract token from pathname
  // Example: https://callqr.app/api/qr-codes/resolve/abc123def456...
  try {
    const url = new URL(input);
    const parts = url.pathname.split('/');
    const tokenCandidate = parts.find(part => /^[a-fA-F0-9]{64}$/.test(part));
    return tokenCandidate || null;
  } catch (error) {
    return null; // Invalid URL format
  }
}
```

### Scan Endpoint

```typescript
async scanQRCode(
  token?: string,
  humanToken?: string
): Promise<{ qrCode: QRCodeType; user: UserInfo | null }>
```

#### Scan Response Structure

**For Unassigned QR**:

```typescript
{
  qrCode: {
    id: "550e8400-e29b-41d4-a716-446655440001",
    token: "a1b2c3d4e5f6...",
    humanToken: "QR-A7BK-M9XZ",
    status: "unassigned",
    assignedUserId: null,  // Null for unassigned
    // ... other fields
  },
  user: null
}
```

**For Active QR**:

```typescript
{
  qrCode: {
    id: "550e8400-e29b-41d4-a716-446655440001",
    token: "a1b2c3d4e5f6...",
    humanToken: "QR-A7BK-M9XZ",
    status: "active",
    assignedUserId: "user-id-123",
    // ... other fields
  },
  user: {
    id: "user-id-123",
    username: "john_doe",
    status: "active"  // Only returned if user is active
  }
}
```

### Redirect Handler

The `/api/qr-codes/resolve/:token` endpoint handles QR code redirects:

```typescript
handleQRScan = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { token } = req.params;
    const userAgent = req.headers['user-agent'] || '';

    // Detect if request from official app
    const isApp =
      req.query.app === 'true' ||
      userAgent.includes(process.env.OFFICIAL_APP_UA_PART);

    const qrCode = await qrCodeService.getQRCodeByToken(token);
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // Unassigned QR → Always redirect to home
    if (qrCode.status === 'unassigned') {
      return res.redirect(302, baseUrl);
    }

    // Attempt to get scan result
    let scanResult;
    try {
      scanResult = await qrCodeService.scanQRCode(token);
    } catch (err) {
      // Web browser: fail silently and redirect home
      if (!isApp) return res.redirect(302, baseUrl);
      // Official app: return error
      throw err;
    }

    const { user } = scanResult;
    const qrCodeId = scanResult.qrCode.humanToken;

    // Web browser: Redirect to contact page
    if (!isApp) {
      // Send push notification to owner if offline
      await this.triggerScanNotificationIfOffline(user.id, qrCodeId);

      const contactUrl = `${baseUrl}/contact?token=${token}&userId=${user.id}&ownerName=${encodeURIComponent(user.username)}`;
      return res.redirect(302, contactUrl);
    }

    // Official app: Return JSON response
    return sendSuccessResponse(res, 200, 'App scan resolved successfully', {
      qrCode: scanResult.qrCode,
      user: scanResult.user,
    });
  }
);
```

### Scan Notification Logic

When a QR code is scanned by someone from a web browser:

```typescript
private async triggerScanNotificationIfOffline(
  userId: string,
  qrCodeId: string
): Promise<void> {
  // Check if user is currently online
  if (socketEmitter.isUserOnline(userId)) {
    return;  // User online, no notification needed
  }

  // User is offline - send push notification
  const tokens = await userService.getUserDeviceTokens(userId);

  if (tokens.length > 0) {
    await notificationService.sendDataNotification(tokens, {
      type: 'qr_scanned',
      qrCodeId,
      title: 'QR Scanned',
      body: 'Someone is viewing your contact page',
    });
  }
}
```

### Example: Web Browser Scan

```
1. User scans QR code with phone camera
2. Browser opens: https://callqr.app/api/qr-codes/resolve/abc123def456...
3. Backend validates token and QR status
4. Backend redirects to: https://callqr.app/contact?token=abc123...&userId=user-123&ownerName=John+Doe
5. If QR owner is offline, push notification sent
6. Web page displays QR owner's contact information
7. Scanner can send message/call/etc. without revealing owner's full number
```

### Example: Official App Scan

```
1. User scans QR code with CallQR official app
2. App sends request to: POST /api/qr-codes/scan with token or humanToken
3. Backend validates and returns JSON:
   {
     "qrCode": { ... },
     "user": {
       "id": "user-123",
       "username": "john_doe",
       "status": "active"
     }
   }
4. App displays owner's profile with direct calling/messaging options
5. Push notification sent to owner if offline
```

---

## QR Code Image Generation

### Image Generation Service

QR codes are generated as PNG images on-demand using the `qrcode` library.

```typescript
async generateQRCodeImage(input: string): Promise<string> {
  // Validate and extract token
  const token = extractQRCodeToken(input);
  if (!token) throw new BadRequestError('Invalid QR token format');

  // Build redirect URL that points to the QR resolver endpoint
  const qrUrl = `${appConfig.backendUrl}/api/qr-codes/resolve/${token}`;

  // Generate QR code as PNG data URL
  const dataURL = await QRCode.toDataURL(qrUrl, {
    width: 300,              // 300x300 pixels
    margin: 2,               // 2-unit margin
    color: {
      dark: '#000000',       // Black modules
      light: '#FFFFFF',      // White background
    },
  });

  return dataURL;  // Base64 encoded PNG
}

async generateQRCodeBuffer(input: string): Promise<Buffer> {
  const token = extractQRCodeToken(input);
  const qrUrl = `${appConfig.backendUrl}/api/qr-codes/resolve/${token}`;

  // Generate as PNG buffer for file operations
  const buffer = await QRCode.toBuffer(qrUrl, {
    type: 'png',
    width: 300,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' },
  });

  return buffer;
}
```

### Get QR Image Endpoint

```typescript
// GET /api/qr-codes/image/:token
getQRCodeImage = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { token } = req.params;
    const dataURL = await qrCodeService.generateQRCodeImage(token);

    // Extract base64 data from data URL
    const base64Data = dataURL.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Send PNG image with caching headers
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache 1 year
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }
);
```

#### Example Usage

```bash
# Get QR code image as PNG
GET /api/qr-codes/image/a1b2c3d4e5f6...

Response:
200 OK
Content-Type: image/png
[PNG binary data]

# Can be embedded in HTML
<img src="/api/qr-codes/image/a1b2c3d4e5f6..." alt="QR Code" />

# Or downloaded
<a href="/api/qr-codes/image/a1b2c3d4e5f6..." download="qr-code.png">
  Download QR Code
</a>
```

### QR Code Data Structure

The QR code contains a URL pointing to the resolver endpoint:

```
https://callqr.app/api/qr-codes/resolve/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0
```

When decoded by a QR scanner, this URL is the actionable content. Scanning the code will navigate to this URL, triggering the redirect or JSON response based on device type.

---

## Lifecycle Management

### Status Transitions

QR codes follow a specific status lifecycle:

```
                     User/Admin
                     Claim/Assign
                          ↓
    unassigned ──────────→ active ──────────→ disabled
                                  ↑           ↓
                                  └─ revoke ──┘ revoked
                                  (from active)
```

**State Descriptions**:

- **unassigned**: Created but not yet claimed by or assigned to any user
- **active**: Assigned to user and ready to be scanned by others
- **disabled**: Temporarily disabled by user (can be reactivated)
- **revoked**: Permanently revoked by user (cannot be reactivated)

### Disable QR Code

Temporarily disable a QR code without losing it:

```typescript
async disableQRCode(qrCodeId: string, userId: string): Promise<QRCodeType> {
  // Only user who owns the QR can disable it
  const [qrCode] = await db.update(qrCodes)
    .set({ status: 'disabled' })
    .where(
      and(
        eq(qrCodes.id, qrCodeId),
        eq(qrCodes.assignedUserId, userId)
      )
    )
    .returning();

  if (!qrCode) {
    throw new NotFoundError('QR code not found or you lack permission');
  }

  return qrCode;
}
```

**Effects of Disabling**:

- Scanning the QR code returns error: "QR code is not active"
- User can reactivate anytime
- Batch status reflects the change in assignment status

#### Example

```bash
PATCH /api/qr-codes/550e8400-e29b-41d4-a716-446655440001/disable
Authorization: Bearer <user-token>

Response (200 OK):
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "disabled",
  // ... other fields
}
```

### Revoke QR Code

Permanently revoke a QR code:

```typescript
async revokeQRCode(qrCodeId: string, userId: string): Promise<QRCodeType> {
  const [qrCode] = await db.update(qrCodes)
    .set({ status: 'revoked' })
    .where(
      and(
        eq(qrCodes.id, qrCodeId),
        eq(qrCodes.assignedUserId, userId)
      )
    )
    .returning();

  if (!qrCode) {
    throw new NotFoundError('QR code not found or you lack permission');
  }

  return qrCode;
}
```

**Effects of Revoking**:

- Scanning the QR code returns error: "QR code is not active"
- User **cannot** reactivate a revoked QR
- QR becomes permanently unusable
- User can claim/be assigned a different QR code

#### Example

```bash
PATCH /api/qr-codes/550e8400-e29b-41d4-a716-446655440001/revoke
Authorization: Bearer <user-token>

Response (200 OK):
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "revoked",
  // ... other fields
}
```

### Reactivate QR Code

Re-enable a disabled QR code:

```typescript
async reactivateQRCode(qrCodeId: string, userId: string): Promise<QRCodeType> {
  const [qrCode] = await db.update(qrCodes)
    .set({ status: 'active' })
    .where(
      and(
        eq(qrCodes.id, qrCodeId),
        eq(qrCodes.assignedUserId, userId)
      )
    )
    .returning();

  if (!qrCode) {
    throw new NotFoundError('QR code not found or you lack permission');
  }

  return qrCode;
}
```

**Important**: Only works on `disabled` QR codes, not `revoked` ones.

#### Example

```bash
PATCH /api/qr-codes/550e8400-e29b-41d4-a716-446655440001/reactivate
Authorization: Bearer <user-token>

Response (200 OK):
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "active",
  // ... other fields
}
```

### Validate Active QR

Check if a QR code is valid and active:

```typescript
async validateQRCode(input: string): Promise<QRCodeType> {
  // Extract token from input (raw token or URL)
  const token = extractQRCodeToken(input);
  if (!token) {
    throw new NotFoundError('Invalid, revoked, or disabled QR code');
  }

  // Only return if QR exists AND is active
  const [qrCode] = await db.select().from(qrCodes)
    .where(
      and(
        eq(qrCodes.token, token),
        eq(qrCodes.status, 'active')
      )
    )
    .limit(1);

  if (!qrCode) {
    throw new NotFoundError('Invalid, revoked, or disabled QR code');
  }

  return qrCode;
}
```

---

## Batch Management

### Batch Status Tracking

Batches have two different status lifecycles depending on their purpose.

### Digital Batch Status Management

Digital batches automatically transition based on assignment counts:

```typescript
async refreshDigitalBatchStatus(batchId?: string | null): Promise<void> {
  if (!batchId) return;

  // Get batch details
  const [batch] = await db.select().from(qrBatches)
    .where(eq(qrBatches.id, batchId))
    .limit(1);

  // Only process digital batches
  if (!batch || batch.purpose !== 'digital') return;

  // Count assigned vs total
  const [summary] = await db.select({
    total: count(qrCodes.id),
    assigned: sql<number>`
      count(case when ${qrCodes.assignedUserId} is not null then 1 end)
    `,
  })
  .from(qrCodes)
  .where(eq(qrCodes.batchId, batchId));

  const total = Number(summary.total || 0);
  const assigned = Number(summary.assigned || 0);

  // Determine new status
  let nextStatus = 'generated';

  if (assigned === 0 && total > 0) {
    nextStatus = 'available';              // 0% assigned
  } else if (assigned > 0 && assigned < total) {
    nextStatus = 'partially_assigned';     // 0% < X < 100%
  } else if (total > 0 && assigned === total) {
    nextStatus = 'fully_assigned';         // 100% assigned
  }

  // Update if status changed
  if (nextStatus !== batch.status) {
    await db.update(qrBatches)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(qrBatches.id, batchId));
  }
}
```

**Digital Batch Status Flow**:

```
generated → available (when first QR claimed)
         ↓
   partially_assigned (some claimed)
         ↓
   fully_assigned (all claimed)
```

### Printing Batch Status Management

Printing batches are managed manually by admins through the workflow:

```
generated → print_pending → printed → distributed
```

**Status Descriptions**:

- `generated`: Batch created, awaiting print job submission
- `print_pending`: Submitted to print provider, awaiting printing
- `printed`: Physical QR codes printed and ready for distribution
- `distributed`: Physical codes have been distributed to users

**Update Endpoint**:

```typescript
PATCH /api/admin/qr-batches/:batchId/status
{
  "status": "printed",
  "printJobRef": "PRINT-JOB-2026-05-22-001",
  "notes": "Printed by ABC Printing Co."
}
```

### Get Batch Information

```bash
# Get all batches
GET /api/admin/qr-batches?purpose=digital&status=available&limit=50&offset=0

Query Parameters:
- purpose: 'printing' | 'digital' (optional)
- status: batch status (optional, see status enums above)
- search: Search by batch number (optional)
- limit: Results per page (1-100, default 50)
- offset: Pagination offset (default 0)

Response:
{
  "batches": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "batchNumber": "DG-220526-001",
      "purpose": "digital",
      "status": "partially_assigned",
      "quantity": 50,
      "createdBy": "admin-id",
      "notes": "Q2 2026 campaign",
      "createdAt": "2026-05-22T14:30:00Z",
      "updatedAt": "2026-05-22T15:50:00Z"
    }
  ],
  "total": 127,
  "limit": 50,
  "offset": 0
}
```

---

## API Endpoints

### User Endpoints

#### Create Single QR Code (Admin)

```http
POST /api/qr-codes/create
Content-Type: application/json
Authorization: Bearer <admin-token>

Response (201 Created):
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "token": "a1b2c3d4e5f6...",
  "humanToken": "QR-A7BK-M9XZ",
  "batchId": null,
  "status": "unassigned",
  "createdAt": "2026-05-22T14:30:00Z"
}
```

#### Create Batch (Bulk)

```http
POST /api/admin/qr-codes/bulk-create
Content-Type: application/json
Authorization: Bearer <admin-token>

{
  "count": 50,
  "purpose": "digital",
  "notes": "Q2 2026 campaign batch",
  "printJobRef": "OPTIONAL-REF"
}

Response (201 Created):
{
  "batch": { ... },
  "qrCodes": [ ... ]
}
```

#### Claim QR Code

```http
POST /api/qr-codes/claim
Content-Type: application/json
Authorization: Bearer <user-token>

{
  "humanToken": "QR-A7BK-M9XZ"
}
// OR
{
  "token": "a1b2c3d4e5f6..."
}

Response (200 OK):
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "active",
  "assignedUserId": "user-id",
  "assignedAt": "2026-05-22T15:45:00Z",
  // ... other fields
}
```

#### List My QR Codes

```http
GET /api/qr-codes/my-codes
Authorization: Bearer <user-token>

Response (200 OK):
{
  "qrCodes": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "token": "a1b2c3d4e5f6...",
      "humanToken": "QR-A7BK-M9XZ",
      "status": "active",
      "assignedUserId": "user-id",
      "createdAt": "2026-05-22T14:30:00Z",
      "assignedAt": "2026-05-22T15:45:00Z"
    }
  ]
}
```

#### Get QR Code Image

```http
GET /api/qr-codes/image/:token

Response (200 OK):
Content-Type: image/png
[PNG binary data - 300x300 pixels]
```

#### Scan QR Code

```http
POST /api/qr-codes/scan
Content-Type: application/json

{
  "humanToken": "QR-A7BK-M9XZ"
}
// OR
{
  "token": "a1b2c3d4e5f6..."
}

Response (200 OK):
{
  "qrCode": { ... },
  "user": {
    "id": "user-id",
    "username": "john_doe",
    "status": "active"
  }
}

// If unassigned QR:
Response (200 OK):
{
  "qrCode": { ... },
  "user": null
}
```

#### Disable QR Code

```http
PATCH /api/qr-codes/:qrCodeId/disable
Authorization: Bearer <user-token>

Response (200 OK):
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "disabled",
  // ... other fields
}
```

#### Reactivate QR Code

```http
PATCH /api/qr-codes/:qrCodeId/reactivate
Authorization: Bearer <user-token>

Response (200 OK):
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "active",
  // ... other fields
}
```

#### Revoke QR Code

```http
PATCH /api/qr-codes/:qrCodeId/revoke
Authorization: Bearer <user-token>

Response (200 OK):
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "revoked",
  // ... other fields
}
```

### Public Endpoints

#### Resolve QR Code

```http
GET /api/qr-codes/resolve/:token

Query Parameters:
- app=true (optional) - Indicates request from official app

Response (302 Redirect) - Web Browser:
Location: https://callqr.app/contact?token=...&userId=...&ownerName=...

Response (200 OK) - Official App:
{
  "qrCode": { ... },
  "user": { ... }
}

Response (302 Redirect) - Unassigned QR:
Location: https://callqr.app/
```

### Admin Endpoints

#### Get All Batches

```http
GET /api/admin/qr-batches?purpose=digital&status=available&limit=50&offset=0
Authorization: Bearer <admin-token>

Query Parameters:
- purpose: 'printing' | 'digital' (optional)
- status: batch status (optional)
- search: Batch number search (optional)
- limit: 1-100 (default 50)
- offset: Pagination offset

Response (200 OK):
{
  "batches": [ ... ],
  "total": 127,
  "limit": 50,
  "offset": 0
}
```

#### Get Batch Details

```http
GET /api/admin/qr-batches/:batchId
Authorization: Bearer <admin-token>

Response (200 OK):
{
  "batch": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "batchNumber": "DG-220526-001",
    "purpose": "digital",
    "status": "partially_assigned",
    "quantity": 50,
    // ... other fields
  },
  "qrCodes": [ ... ]  // All QR codes in batch
}
```

#### Update Batch Status

```http
PATCH /api/admin/qr-batches/:batchId/status
Content-Type: application/json
Authorization: Bearer <admin-token>

{
  "status": "printed",
  "printJobRef": "PRINT-JOB-001",
  "notes": "Printed by ABC Printing Co."
}

Response (200 OK):
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "printed",
  // ... other fields
}
```

#### Get All QR Codes

```http
GET /api/admin/qr-codes?status=unassigned&limit=50&offset=0
Authorization: Bearer <admin-token>

Query Parameters:
- status: 'unassigned' | 'active' | 'disabled' | 'revoked' (optional)
- search: Search by token or human token (optional)
- batchId: Filter by batch (optional)
- limit: 1-100 (default 50)
- offset: Pagination offset

Response (200 OK):
{
  "qrCodes": [ ... ],
  "total": 500,
  "limit": 50,
  "offset": 0
}
```

#### Get QR Code Details

```http
GET /api/admin/qr-codes/:qrCodeId
Authorization: Bearer <admin-token>

Response (200 OK):
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "token": "a1b2c3d4e5f6...",
  "humanToken": "QR-A7BK-M9XZ",
  "status": "active",
  "assignedUserId": "user-id",
  "batchId": "batch-id",
  // ... other fields
}
```

#### Assign QR Code

```http
POST /api/admin/qr-codes/:qrCodeId/assign
Content-Type: application/json
Authorization: Bearer <admin-token>

{
  "userId": "user-id-to-assign"
}

Response (200 OK):
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "status": "active",
  "assignedUserId": "user-id-to-assign",
  "assignedAt": "2026-05-22T15:50:00Z",
  // ... other fields
}
```

---

## Status Transitions

### QR Code Status Diagram

```
                          User Claims/Admin Assigns
                                  |
                                  ↓
┌──────────────────────────────────┐
│                                  │
│        unassigned                │
│  (New QR, not yet assigned)      │
│                                  │
└────────────┬─────────────────────┘
             │
             │ claimQRCode() / assignQRCode()
             │
             ↓
┌──────────────────────────────────┐
│                                  │
│         active                   │
│  (Ready to scan, assigned to user)
│                                  │
└──┬────────────────────────────┬──┘
   │                            │
   │ disableQRCode()            │ revokeQRCode()
   │                            │
   ↓                            ↓
┌──────────────────┐    ┌─────────────────────┐
│                  │    │                     │
│    disabled      │    │     revoked         │
│ (Temporarily off)│    │ (Permanently off)   │
│                  │    │                     │
└────────┬─────────┘    └─────────────────────┘
         │
         │ reactivateQRCode()
         │ (NOT possible for revoked)
         │
         ↓
      active
```

### Batch Status Lifecycle

**Digital Batch** (Auto-transitioning):

```
created
   ↓
generated (0 assigned)
   ↓
available (0% assigned)
   ↓
partially_assigned (1-99% assigned)
   ↓
fully_assigned (100% assigned)
```

**Printing Batch** (Manual updates):

```
created
   ↓
generated → print_pending → printed → distributed
(Manual admin updates)
```

---

## Business Rules

### One Active QR Per User

A user can only have **one** QR code in `active` or `disabled` status at any given time.

- If user has active/disabled QR → Cannot claim/assign another QR
- Error: "You already have an active QR code. Please revoke it first."
- Solution: User must revoke existing QR before claiming/being assigned a new one

### Batch Count Constraints

QR code batches can only be created in specific quantities:

**Allowed**: 10, 25, 50, 100, 200, 500, 1000

- Batch size must be one of these exact values
- Error: "Count must be one of: 10, 25, 50, 100, 200, 500, 1000"

### Unassigned QR Redirect

When an unassigned QR code is scanned:

- Both web browsers and apps receive the same response
- Redirect to home page (`FRONTEND_URL`)
- No error returned - silent redirect

### Token Format Flexibility

QR codes accept both token formats for operations:

- **Secure Token**: 64-character hex string (internal, in URLs)
- **Human Token**: QR-XXXX-XXXX format (user-friendly, manual entry)

Either can be used for: claim, scan, validate operations.

### Scan Notifications

Push notifications are sent when:

1. QR code is scanned by third party (web browser)
2. QR owner is **offline** (not socket-connected)
3. Owner has registered device tokens (FCM)

No notification if:

- QR is unassigned
- Owner is currently online (socket-connected)
- Owner has no device tokens registered

---

## Error Handling

### Common Error Responses

#### Invalid Token Format

```
400 Bad Request
{
  "error": "Invalid QR token format"
}
```

**Causes**:

- Token is not 64 hex characters
- Token URL cannot be parsed
- Invalid human token format

#### QR Code Not Found

```
404 Not Found
{
  "error": "QR code not found"
}
```

**Causes**:

- Token/humanToken doesn't match any QR code
- QR code deleted or not yet created

#### QR Code Already Claimed

```
400 Bad Request
{
  "error": "QR code is already claimed or not available"
}
```

**Causes**:

- QR status is not `unassigned`
- QR is `active`, `disabled`, or `revoked`

#### User Already Has Active QR

```
400 Bad Request
{
  "error": "You already have an active QR code. Please revoke it first."
}
```

**Causes**:

- User attempting to claim/be assigned a QR
- User already has `active` or `disabled` QR
- User must revoke existing QR first

#### QR Code Not Active

```
400 Bad Request
{
  "error": "QR code is not active"
}
```

**Causes**:

- Scanning a `disabled` or `revoked` QR
- QR owner's account is not active

#### Invalid User Status

```
400 Bad Request
{
  "error": "Cannot assign QR code to inactive user"
}
```

**Causes**:

- Admin attempting to assign QR to inactive user
- Target user's status is not `active`

#### Unauthorized

```
403 Forbidden
{
  "error": "You lack permission to perform this action"
}
```

**Causes**:

- User attempting to manage QR they don't own
- Non-admin attempting admin endpoint
- Invalid or expired auth token

---

## Implementation Examples

### Example 1: Complete User QR Workflow

```typescript
// 1. Admin creates batch of 10 digital QR codes
POST /api/admin/qr-codes/bulk-create
{
  "count": 10,
  "purpose": "digital",
  "notes": "New user onboarding batch"
}

// Response includes batch and 10 unassigned QR codes

// 2. User registers and wants to claim a QR code
// User receives humanToken from admin/email: QR-A7BK-M9XZ

POST /api/qr-codes/claim
{
  "humanToken": "QR-A7BK-M9XZ"
}

// Response: QR is now active, assigned to user
// Batch status auto-updates to "partially_assigned"

// 3. User wants to see their QR code
GET /api/qr-codes/my-codes

// Response: [{ id, token, humanToken, status: "active", ... }]

// 4. User wants QR image to share
GET /api/qr-codes/image/a1b2c3d4e5f6...

// Response: PNG image (300x300 pixels)

// 5. Someone scans the QR code with phone camera
// Browser redirects to contact page
GET /api/qr-codes/resolve/a1b2c3d4e5f6...

// If user offline: Push notification sent
// Browser redirected to: /contact?token=...&userId=...&ownerName=...

// 6. User temporarily disables QR (going on vacation)
PATCH /api/qr-codes/550e8400.../disable

// Response: status is now "disabled"
// Scans now return: "QR code is not active"

// 7. User comes back and reactivates
PATCH /api/qr-codes/550e8400.../reactivate

// Response: status is now "active" again

// 8. User decides to never use this QR again
PATCH /api/qr-codes/550e8400.../revoke

// Response: status is now "revoked"
// QR is permanently unusable

// 9. User claims a new QR code (now possible since old one revoked)
POST /api/qr-codes/claim
{
  "humanToken": "QR-X3YZ-K7BN"
}

// Success! New QR is now active
```

### Example 2: Admin Batch Management

```typescript
// 1. Admin creates printing batch for 100 physical QR codes
POST /api/admin/qr-codes/bulk-create
{
  "count": 100,
  "purpose": "printing",
  "notes": "Office reception desk batch",
  "printJobRef": null
}

// 2. Admin sends to print provider
// Gets back print job reference

PATCH /api/admin/qr-batches/batch-id/status
{
  "status": "print_pending",
  "printJobRef": "PRINTPROV-2026-05-22-001",
  "notes": "Submitted to ABC Printing"
}

// 3. Physical QR codes arrive
PATCH /api/admin/qr-batches/batch-id/status
{
  "status": "printed",
  "notes": "Received, quality check passed"
}

// 4. QR codes distributed to office locations
PATCH /api/admin/qr-batches/batch-id/status
{
  "status": "distributed",
  "distributedAt": "2026-05-25T10:00:00Z",
  "notes": "Distribution complete"
}

// 5. Admin monitors digital batch assignment progress
GET /api/admin/qr-batches?purpose=digital&status=partially_assigned

// Shows batches with some QRs assigned by users
```

---

## Related Documentation

- [QR_BATCHES.md](QR_BATCHES.md) - Batch management details
- [API_ENDPOINTS.md](API_ENDPOINTS.md) - Complete API reference
- [VERIFICATION.md](VERIFICATION.md) - QR verification processes
- [CODEBASE_RULES.md](CODEBASE_RULES.md) - Code standards and practices
