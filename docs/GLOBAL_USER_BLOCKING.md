# Global User Blocking

## Overview

Global User Blocking is an admin-only feature that allows administrators to permanently block users from accessing the entire platform. Unlike regular blocking (which only affects specific features), globally blocked users cannot:

- Login to the system
- Access any API endpoints
- Use WebRTC features
- Send/receive messages
- Make/receive calls

## Key Differences

| Feature | Regular Block | Global Block |
|---------|--------------|--------------|
| Scope | Limited features | Entire platform |
| Login | Allowed | Denied |
| API Access | Partial | Completely denied |
| Reversible | Yes | Yes (admin only) |
| Reason Required | No | Yes |
| Audit Trail | Limited | Full (who, when, why) |

## Flow Diagram

```
Admin                   Backend                     Database
  |                        |                            |
  |--Global Block User---->|                            |
  |   (userId + reason)    |                            |
  |                        |--Verify Admin------------->|
  |                        |<--Admin Verified-----------|
  |                        |                            |
  |                        |--Update User Record------->|
  |                        |  (set global block flags)  |
  |                        |<--User Blocked-------------|
  |<--Success Response-----|                            |
  |                        |                            |

Blocked User            Backend                     Database
  |                        |                            |
  |--Login Attempt-------->|                            |
  |   (credentials)        |                            |
  |                        |--Check Credentials-------->|
  |                        |<--User Found---------------|
  |                        |                            |
  |                        |--Check Global Block------->|
  |                        |<--User is Blocked----------|
  |<--403 Forbidden--------|                            |
  |   (blocked message)    |                            |
```

## API Endpoints

### 1. Global Block User (Admin Only)

**Endpoint:** `POST /api/admin/users/:userId/global-block`

**Headers:**
```
Authorization: Bearer <admin-jwt-token>
```

**Request Body:**
```json
{
  "reason": "Violation of terms of service - spam activity"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "User globally blocked successfully",
  "data": {
    "id": "user-uuid",
    "username": "spammer123",
    "status": "blocked",
    "isGloballyBlocked": "true",
    "globalBlockReason": "Violation of terms of service - spam activity",
    "globalBlockedAt": "2026-02-27T10:30:00Z",
    "globalBlockedBy": "admin-uuid"
  }
}
```

**Response (Error - Not Admin):**
```json
{
  "success": false,
  "message": "Admin access required"
}
```

### 2. Global Unblock User (Admin Only)

**Endpoint:** `POST /api/admin/users/:userId/global-unblock`

**Headers:**
```
Authorization: Bearer <admin-jwt-token>
```

**Response (Success):**
```json
{
  "success": true,
  "message": "User globally unblocked successfully",
  "data": {
    "id": "user-uuid",
    "username": "spammer123",
    "status": "active",
    "isGloballyBlocked": "false"
  }
}
```

### 3. Get Globally Blocked Users (Admin Only)

**Endpoint:** `GET /api/admin/users/global-blocked/list`

**Headers:**
```
Authorization: Bearer <admin-jwt-token>
```

**Query Parameters:**
- `limit` (optional, default: 100)
- `offset` (optional, default: 0)

**Response (Success):**
```json
{
  "success": true,
  "message": "Globally blocked users retrieved successfully",
  "data": {
    "users": [
      {
        "id": "user-uuid-1",
        "username": "spammer123",
        "status": "blocked",
        "isGloballyBlocked": "true",
        "globalBlockReason": "Spam activity",
        "globalBlockedAt": "2026-02-27T10:30:00Z",
        "globalBlockedBy": "admin-uuid"
      },
      {
        "id": "user-uuid-2",
        "username": "abuser456",
        "status": "blocked",
        "isGloballyBlocked": "true",
        "globalBlockReason": "Harassment",
        "globalBlockedAt": "2026-02-26T15:20:00Z",
        "globalBlockedBy": "admin-uuid"
      }
    ],
    "count": 2
  }
}
```

## Database Schema Changes

### New Fields in `users` Table

```typescript
isGloballyBlocked: varchar('is_globally_blocked', { length: 10 }).notNull().default('false')
globalBlockReason: text('global_block_reason')
globalBlockedAt: timestamp('global_blocked_at')
globalBlockedBy: uuid('global_blocked_by')
```

### Index Added

```typescript
isGloballyBlockedIdx: index('users_is_globally_blocked_idx').on(table.isGloballyBlocked)
```

## Security Implementation

### 1. Login Check

When a user attempts to login, the system checks if they are globally blocked:

```typescript
// In user.service.ts - authenticateUser()
if (user.isGloballyBlocked === 'true') {
  throw new ForbiddenError('Your account has been globally blocked. Please contact support.');
}
```

### 2. Authentication Middleware Check

Every authenticated request checks for global blocking:

```typescript
// In auth.middleware.ts - authenticateToken()
const isBlocked = await userService.isGloballyBlocked(req.user.userId);

if (isBlocked) {
  return next(new ForbiddenError('Your account has been globally blocked. Please contact support.'));
}
```

### 3. Password Reset Check

Globally blocked users cannot reset their password:

```typescript
// In user.service.ts - generatePasswordResetToken()
if (user.isGloballyBlocked === 'true') {
  throw new ForbiddenError('Account is globally blocked. Contact support.');
}
```

## Use Cases

### When to Use Global Block

1. **Severe Terms of Service Violations**
   - Spam or bot activity
   - Harassment or abuse
   - Illegal content sharing
   - Fraudulent activity

2. **Security Threats**
   - Compromised accounts
   - Malicious activity
   - DDoS attempts
   - System abuse

3. **Legal Requirements**
   - Court orders
   - Law enforcement requests
   - Regulatory compliance

### When NOT to Use Global Block

1. **Minor violations** - Use regular blocking instead
2. **Temporary issues** - Use account suspension
3. **Payment issues** - Use subscription management
4. **First-time offenses** - Issue warnings first

## Admin Workflow

### Blocking a User

```bash
# 1. Identify problematic user
GET /api/admin/users?search=spammer123

# 2. Review user activity
GET /api/admin/users/:userId

# 3. Global block with reason
POST /api/admin/users/:userId/global-block
{
  "reason": "Repeated spam activity after warnings"
}

# 4. Verify block
GET /api/admin/users/global-blocked/list
```

### Unblocking a User

```bash
# 1. Review block reason
GET /api/admin/users/:userId

# 2. Unblock if appropriate
POST /api/admin/users/:userId/global-unblock

# 3. Verify unblock
GET /api/admin/users/:userId
```

## Audit Trail

Every global block action is logged with:

- **Who**: Admin user ID who performed the action
- **When**: Timestamp of the block
- **Why**: Reason provided by admin
- **What**: User ID and username

This creates a complete audit trail for compliance and review.

## User Experience

### Blocked User Attempting Login

```json
{
  "success": false,
  "message": "Your account has been globally blocked. Please contact support."
}
```

### Blocked User with Active Session

When a globally blocked user tries to access any endpoint:

```json
{
  "success": false,
  "message": "Your account has been globally blocked. Please contact support."
}
```

### Support Contact

Blocked users should be directed to:
- Support email: support@yourdomain.com
- Support ticket system
- Appeal process documentation

## Testing

### Test Global Block

```bash
# 1. Create test user
POST /api/auth/register
{
  "username": "testuser",
  "password": "password123",
  "email": "test@example.com"
}

# 2. Login as admin
POST /api/auth/login
{
  "username": "admin",
  "password": "adminpass"
}

# 3. Global block test user
POST /api/admin/users/:userId/global-block
Authorization: Bearer <admin-token>
{
  "reason": "Testing global block feature"
}

# 4. Try to login as blocked user (should fail)
POST /api/auth/login
{
  "username": "testuser",
  "password": "password123"
}

# Expected: 403 Forbidden with blocked message

# 5. Unblock user
POST /api/admin/users/:userId/global-unblock
Authorization: Bearer <admin-token>

# 6. Login should work now
POST /api/auth/login
{
  "username": "testuser",
  "password": "password123"
}
```

## Migration

Run database migration to add new fields:

```bash
npm run db:push
```

Or manually add fields:

```sql
ALTER TABLE users 
ADD COLUMN is_globally_blocked VARCHAR(10) NOT NULL DEFAULT 'false',
ADD COLUMN global_block_reason TEXT,
ADD COLUMN global_blocked_at TIMESTAMP,
ADD COLUMN global_blocked_by UUID;

CREATE INDEX users_is_globally_blocked_idx ON users(is_globally_blocked);
```

## Best Practices

1. **Always provide a reason**: Document why the user was blocked
2. **Review before blocking**: Ensure the action is justified
3. **Regular audits**: Review blocked users periodically
4. **Clear communication**: Inform users how to appeal
5. **Document process**: Maintain internal guidelines for blocking
6. **Legal compliance**: Ensure blocks comply with regulations
7. **Reversible**: Always allow for unblocking if circumstances change

## Monitoring

Track global blocking metrics:

```sql
-- Count globally blocked users
SELECT COUNT(*) FROM users WHERE is_globally_blocked = 'true';

-- Blocks by admin
SELECT global_blocked_by, COUNT(*) 
FROM users 
WHERE is_globally_blocked = 'true' 
GROUP BY global_blocked_by;

-- Recent blocks
SELECT username, global_block_reason, global_blocked_at 
FROM users 
WHERE is_globally_blocked = 'true' 
ORDER BY global_blocked_at DESC 
LIMIT 10;
```

## Error Handling

| Scenario | Status Code | Message |
|----------|-------------|---------|
| Non-admin attempts block | 403 | Admin access required |
| User already blocked | 400 | User is already globally blocked |
| User not found | 404 | User not found |
| Blocked user login | 403 | Your account has been globally blocked. Please contact support. |
| Blocked user API access | 403 | Your account has been globally blocked. Please contact support. |
| User not blocked (unblock) | 400 | User is not globally blocked |

## Integration with Other Features

### WebRTC Service
Globally blocked users are automatically disconnected from Socket.IO and cannot reconnect.

### Subscription Service
Active subscriptions are not automatically canceled but cannot be used.

### QR Codes
QR codes owned by blocked users remain assigned but cannot be used for calls/chats.

### Messages & Calls
All active sessions are terminated when a user is globally blocked.
