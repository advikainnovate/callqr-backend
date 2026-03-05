# New Features Summary

## Overview

Two major security and user management features have been added to the CallQR backend system:

1. **Forgot Password / Password Reset**
2. **Global User Blocking**

---

## 1. Forgot Password / Password Reset

### Purpose
Allows users to securely reset their password via email verification when they forget their credentials.

### Key Features
- Secure token generation (32-byte random, SHA-256 hashed)
- 1-hour token expiration
- One-time use tokens
- Global blocking check (blocked users cannot reset)
- Development mode testing support

### API Endpoints

#### Request Password Reset
```
POST /api/auth/forgot-password
Body: { "email": "user@example.com" }
```

#### Reset Password
```
POST /api/auth/reset-password
Body: { "token": "abc123...", "newPassword": "newPass123" }
```

### Database Changes
```typescript
// New fields in users table
resetPasswordToken: text('reset_password_token')
resetPasswordExpires: timestamp('reset_password_expires')

// New index
resetPasswordTokenIdx: index('users_reset_password_token_idx')
```

### Security Features
- Token hashed before storage (SHA-256)
- 1-hour expiration window
- Tokens cleared after successful reset
- Rate limiting protection
- Global block check

### Documentation
See: `docs/FORGOT_PASSWORD_FLOW.md`

---

## 2. Global User Blocking

### Purpose
Provides administrators with the ability to permanently block users from accessing the entire platform, not just specific features.

### Key Features
- Admin-only access
- Requires reason for blocking (audit trail)
- Blocks all platform access (login, API, WebRTC)
- Reversible by admins
- Complete audit trail (who, when, why)

### API Endpoints

#### Global Block User (Admin)
```
POST /api/admin/users/:userId/global-block
Body: { "reason": "Spam activity" }
```

#### Global Unblock User (Admin)
```
POST /api/admin/users/:userId/global-unblock
```

#### Get Globally Blocked Users (Admin)
```
GET /api/admin/users/global-blocked/list
Query: ?limit=100&offset=0
```

### Database Changes
```typescript
// New fields in users table
isGloballyBlocked: varchar('is_globally_blocked', { length: 10 }).default('false')
globalBlockReason: text('global_block_reason')
globalBlockedAt: timestamp('global_blocked_at')
globalBlockedBy: uuid('global_blocked_by')

// New index
isGloballyBlockedIdx: index('users_is_globally_blocked_idx')
```

### Security Implementation

#### 1. Login Check
```typescript
// Blocks login attempts
if (user.isGloballyBlocked === 'true') {
  throw new ForbiddenError('Account globally blocked. Contact support.');
}
```

#### 2. Authentication Middleware
```typescript
// Checks every authenticated request
const isBlocked = await userService.isGloballyBlocked(userId);
if (isBlocked) {
  throw new ForbiddenError('Account globally blocked. Contact support.');
}
```

#### 3. Password Reset Check
```typescript
// Prevents password reset for blocked users
if (user.isGloballyBlocked === 'true') {
  throw new ForbiddenError('Account globally blocked. Contact support.');
}
```

### Use Cases
- Severe ToS violations (spam, harassment, fraud)
- Security threats (compromised accounts, malicious activity)
- Legal requirements (court orders, law enforcement)

### Documentation
See: `docs/GLOBAL_USER_BLOCKING.md`

---

## Migration Instructions

### 1. Update Database Schema

Run Drizzle migration:
```bash
npm run db:push
```

Or manually execute SQL:
```sql
-- Forgot Password fields
ALTER TABLE users 
ADD COLUMN reset_password_token TEXT,
ADD COLUMN reset_password_expires TIMESTAMP;

CREATE INDEX users_reset_password_token_idx ON users(reset_password_token);

-- Global Blocking fields
ALTER TABLE users 
ADD COLUMN is_globally_blocked VARCHAR(10) NOT NULL DEFAULT 'false',
ADD COLUMN global_block_reason TEXT,
ADD COLUMN global_blocked_at TIMESTAMP,
ADD COLUMN global_blocked_by UUID;

CREATE INDEX users_is_globally_blocked_idx ON users(is_globally_blocked);
```

### 2. Verify Schema
```bash
node scripts/verify-schema.js
```

### 3. Test Endpoints

#### Test Forgot Password
```bash
# Request reset
curl -X POST http://localhost:9001/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Reset password (use token from response in dev mode)
curl -X POST http://localhost:9001/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"TOKEN_HERE","newPassword":"newPass123"}'
```

#### Test Global Blocking
```bash
# Login as admin
curl -X POST http://localhost:9001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"adminpass"}'

# Global block user
curl -X POST http://localhost:9001/api/admin/users/USER_ID/global-block \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Testing global block"}'

# Try to login as blocked user (should fail)
curl -X POST http://localhost:9001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"blockeduser","password":"password"}'

# Unblock user
curl -X POST http://localhost:9001/api/admin/users/USER_ID/global-unblock \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

---

## Files Modified

### Core Files
1. `src/models/user.schema.ts` - Added new database fields
2. `src/services/user.service.ts` - Added password reset and global blocking methods
3. `src/controllers/auth.controller.ts` - Added forgot/reset password handlers
4. `src/routes/auth.routes.ts` - Added new auth routes
5. `src/controllers/admin.controller.ts` - Added global blocking handlers
6. `src/routes/admin.routes.ts` - Added global blocking routes
7. `src/middlewares/auth.middleware.ts` - Added global block check

### Documentation Files
1. `API_ENDPOINTS.md` - Updated with new endpoints
2. `docs/FORGOT_PASSWORD_FLOW.md` - Complete password reset documentation
3. `docs/GLOBAL_USER_BLOCKING.md` - Complete global blocking documentation
4. `docs/NEW_FEATURES_SUMMARY.md` - This file

---

## Production Considerations

### Forgot Password
1. **Email Integration Required**: Integrate with SendGrid, AWS SES, or similar
2. **Remove Dev Token**: Don't return reset token in production responses
3. **HTTPS Required**: Always use HTTPS to protect tokens in transit
4. **Rate Limiting**: Monitor for abuse of password reset requests
5. **Email Templates**: Create professional email templates for reset links

### Global Blocking
1. **Admin Training**: Train admins on when to use global blocking
2. **Appeal Process**: Establish a process for users to appeal blocks
3. **Legal Review**: Ensure blocking process complies with regulations
4. **Monitoring**: Track blocking metrics and review regularly
5. **Documentation**: Maintain internal guidelines for blocking decisions

---

## Testing Checklist

### Forgot Password
- [ ] Request reset with valid email
- [ ] Request reset with invalid email (should not reveal if email exists)
- [ ] Reset password with valid token
- [ ] Reset password with expired token (should fail)
- [ ] Reset password with invalid token (should fail)
- [ ] Reset password for globally blocked user (should fail)
- [ ] Verify token is cleared after successful reset
- [ ] Verify token expires after 1 hour

### Global Blocking
- [ ] Admin can block user with reason
- [ ] Admin can unblock user
- [ ] Admin can view list of blocked users
- [ ] Non-admin cannot access blocking endpoints
- [ ] Blocked user cannot login
- [ ] Blocked user with active session cannot access API
- [ ] Blocked user cannot reset password
- [ ] Unblocked user can login normally
- [ ] Audit trail is complete (who, when, why)

---

## Support & Troubleshooting

### Common Issues

#### Forgot Password Not Working
1. Check email is encrypted and stored correctly
2. Verify token generation and hashing
3. Check token expiration logic
4. Ensure email service is configured (production)

#### Global Blocking Not Working
1. Verify database schema is updated
2. Check authentication middleware is applied
3. Ensure admin middleware is working
4. Verify global block checks in login flow

### Debug Commands

```bash
# Check user's global block status
SELECT id, username, is_globally_blocked, global_block_reason 
FROM users 
WHERE username = 'testuser';

# Check reset token
SELECT id, username, reset_password_token, reset_password_expires 
FROM users 
WHERE username = 'testuser';

# List all globally blocked users
SELECT username, global_block_reason, global_blocked_at 
FROM users 
WHERE is_globally_blocked = 'true';
```

---

## Future Enhancements

### Forgot Password
- [ ] Email service integration (SendGrid/AWS SES)
- [ ] SMS-based password reset option
- [ ] Two-factor authentication for reset
- [ ] Password reset history tracking
- [ ] Suspicious activity detection

### Global Blocking
- [ ] Temporary blocks with auto-expiry
- [ ] Block severity levels
- [ ] Automated blocking based on behavior
- [ ] User notification system
- [ ] Appeal workflow system
- [ ] Block reason categories/templates

---

## Contact

For questions or issues with these features:
- Review documentation in `docs/` folder
- Check API_ENDPOINTS.md for endpoint details
- Test using Bruno collections in `bruno/` folder
- Contact development team for support
