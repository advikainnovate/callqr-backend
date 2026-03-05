# Forgot Password Flow

## Overview

The forgot password feature allows users to reset their password via email verification. The system generates a secure reset token that expires after 1 hour.

## Flow Diagram

```
User                    Backend                     Database
  |                        |                            |
  |--Forgot Password------>|                            |
  |   (email)              |                            |
  |                        |--Find User by Email------->|
  |                        |<--User Found---------------|
  |                        |                            |
  |                        |--Generate Reset Token----->|
  |                        |  (SHA-256 hash)            |
  |                        |<--Token Saved--------------|
  |<--Success Response-----|                            |
  |   (token in dev mode)  |                            |
  |                        |                            |
  |--Reset Password------->|                            |
  |   (token + new pwd)    |                            |
  |                        |--Verify Token------------->|
  |                        |<--Token Valid--------------|
  |                        |                            |
  |                        |--Update Password---------->|
  |                        |  (clear token)             |
  |                        |<--Password Updated---------|
  |<--Success Response-----|                            |
```

## API Endpoints

### 1. Request Password Reset

**Endpoint:** `POST /api/auth/forgot-password`

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Password reset token generated. Check your email.",
  "data": {
    "message": "If an account exists with this email, a password reset link has been sent.",
    "resetToken": "abc123..." // Only in development mode
  }
}
```

**Response (Error - User Not Found):**
```json
{
  "success": false,
  "message": "No account found with this email address"
}
```

**Response (Error - Globally Blocked):**
```json
{
  "success": false,
  "message": "Account is globally blocked. Contact support."
}
```

### 2. Reset Password

**Endpoint:** `POST /api/auth/reset-password`

**Request Body:**
```json
{
  "token": "abc123...",
  "newPassword": "newSecurePassword123"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Password reset successful. You can now login with your new password.",
  "data": null
}
```

**Response (Error - Invalid Token):**
```json
{
  "success": false,
  "message": "Invalid or expired reset token"
}
```

**Response (Error - Token Expired):**
```json
{
  "success": false,
  "message": "Reset token has expired"
}
```

## Security Features

### Token Generation
- 32-byte random token generated using `crypto.randomBytes()`
- Token is hashed using SHA-256 before storage
- Original token sent to user (via email in production)
- Hashed token stored in database

### Token Expiration
- Tokens expire after 1 hour
- Expired tokens are rejected during reset
- Tokens are cleared after successful password reset

### Rate Limiting
- Standard API rate limiting applies (100 requests per 15 minutes)
- Prevents brute force attacks on reset tokens

### Global Blocking Check
- Users who are globally blocked cannot request password reset
- Prevents abuse from blocked accounts

## Database Schema Changes

### New Fields in `users` Table

```typescript
resetPasswordToken: text('reset_password_token')
resetPasswordExpires: timestamp('reset_password_expires')
```

### Index Added

```typescript
resetPasswordTokenIdx: index('users_reset_password_token_idx').on(table.resetPasswordToken)
```

## Implementation Details

### Token Storage
- Token is hashed using SHA-256 before storage
- Only hashed version stored in database
- Original token never stored

### Email Integration (TODO)

In production, integrate with an email service:

```typescript
// Example with SendGrid
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const msg = {
  to: user.email,
  from: 'noreply@yourdomain.com',
  subject: 'Password Reset Request',
  html: `
    <p>You requested a password reset.</p>
    <p>Click this link to reset your password:</p>
    <a href="${process.env.FRONTEND_URL}/reset-password?token=${token}">
      Reset Password
    </a>
    <p>This link expires in 1 hour.</p>
  `,
};

await sgMail.send(msg);
```

### Frontend Integration

```javascript
// Request password reset
const forgotPassword = async (email) => {
  const response = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  
  const data = await response.json();
  
  if (data.success) {
    alert('Check your email for reset instructions');
  }
};

// Reset password
const resetPassword = async (token, newPassword) => {
  const response = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });
  
  const data = await response.json();
  
  if (data.success) {
    alert('Password reset successful! You can now login.');
    window.location.href = '/login';
  }
};
```

## Testing

### Development Mode
In development, the reset token is returned in the API response for testing purposes.

```bash
# Request reset
curl -X POST http://localhost:9001/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'

# Response includes token in dev mode
{
  "success": true,
  "data": {
    "resetToken": "abc123..."
  }
}

# Use token to reset password
curl -X POST http://localhost:9001/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"abc123...","newPassword":"newPassword123"}'
```

### Production Mode
In production, remove the token from the response and send it via email only.

## Error Handling

| Error | Status Code | Message |
|-------|-------------|---------|
| Email not found | 404 | No account found with this email address |
| Account inactive | 400 | Account is not active |
| Globally blocked | 403 | Account is globally blocked. Contact support. |
| Invalid token | 400 | Invalid or expired reset token |
| Token expired | 400 | Reset token has expired |
| Weak password | 400 | Password must be at least 6 characters long |

## Best Practices

1. **Never reveal if email exists**: Always return success message even if email not found
2. **Use HTTPS**: Always use HTTPS in production to protect tokens in transit
3. **Short expiration**: 1-hour expiration balances security and usability
4. **One-time use**: Tokens are cleared after successful reset
5. **Email verification**: Only send reset links to verified email addresses
6. **Audit logging**: Log all password reset attempts for security monitoring

## Migration

Run database migration to add new fields:

```bash
npm run db:push
```

Or manually add fields:

```sql
ALTER TABLE users 
ADD COLUMN reset_password_token TEXT,
ADD COLUMN reset_password_expires TIMESTAMP;

CREATE INDEX users_reset_password_token_idx ON users(reset_password_token);
```
