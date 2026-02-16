# Phase 2: Quick Start Guide

## What Was Implemented

Phase 2 adds critical features for production readiness:
- File upload handling with validation
- Email verification and password reset flows
- Soft delete with user recovery
- Global user blocking
- Status transition validation
- QR code expiration
- Environment-specific configurations

## Setup Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Database Migration
```bash
# Option 1: Using drizzle-kit
npm run db:push

# Option 2: Manual SQL execution
psql -U your_user -d your_database -f drizzle/0003_phase2_features.sql
```

### 3. Configure Environment Variables
Update your `.env` file with new variables:

```env
# Email Configuration (for verification and password reset)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
FROM_EMAIL=noreply@yourapp.com
APP_URL=http://localhost:4000

# File Upload Configuration
MAX_FILE_SIZE=10485760
UPLOAD_PATH=uploads
ALLOWED_MIME_TYPES=image/jpeg,image/png,image/gif,application/pdf,text/plain
```

### 4. Create Upload Directory
```bash
mkdir uploads
```

### 5. Build and Start
```bash
npm run build
npm start
```

## New API Endpoints to Implement

### Authentication
```typescript
// Request email verification
POST /api/auth/request-email-verification
Body: { email: string }

// Verify email
GET /api/auth/verify-email?token=xxx

// Request password reset
POST /api/auth/request-password-reset
Body: { username: string, email: string }

// Reset password
POST /api/auth/reset-password
Body: { token: string, newPassword: string }
```

### User Management (Admin)
```typescript
// Block user
POST /api/admin/users/:userId/block
Body: { reason?: string }

// Unblock user
POST /api/admin/users/:userId/unblock

// Soft delete user
DELETE /api/admin/users/:userId
Body: { reason?: string, recoveryDays?: number }

// Recover deleted user
POST /api/admin/users/:userId/recover
```

### File Upload
```typescript
// Add to message controller
import { uploadSingle, validateFileSize } from '../middlewares/upload';

router.post('/messages',
  authenticate,
  uploadSingle('file'),
  validateFileSize,
  messageController.sendMessage
);
```

## Usage Examples

### 1. Email Verification Flow
```typescript
import { authService } from './services/auth.service';

// Request verification
await authService.requestEmailVerification(userId, 'user@example.com');

// User clicks link in email
await authService.verifyEmail(token);
```

### 2. Password Reset Flow
```typescript
// Request reset
await authService.requestPasswordReset('username', 'user@example.com');

// User clicks link and submits new password
await authService.resetPassword(token, 'newPassword123');
```

### 3. User Blocking
```typescript
import { userService } from './services/user.service';

// Block user
await userService.blockUser(userId, 'Spam violation', adminId);

// Unblock user
await userService.unblockUser(userId);
```

### 4. Soft Delete with Recovery
```typescript
// Delete user (30-day recovery period)
await userService.deleteUser(userId, adminId, 'User requested deletion', 30);

// Recover within 30 days
await userService.recoverUser(userId);

// Permanent deletion (after recovery period)
await userService.permanentlyDeleteUser(userId);
```

### 5. QR Code with Expiration
```typescript
import { qrCodeService } from './services/qrCode.service';

// Create QR code that expires in 90 days
const qrCode = await qrCodeService.createQRCode(90);

// Validation automatically checks expiration
await qrCodeService.validateQRCode(token); // Throws error if expired
```

### 6. File Upload
```typescript
// In your route
import { uploadSingle, validateFileSize } from './middlewares/upload';

router.post('/upload',
  authenticate,
  uploadSingle('file'),
  validateFileSize,
  async (req, res) => {
    const file = req.file;
    // file.filename, file.path, file.size, file.mimetype
    res.json({ success: true, file });
  }
);
```

### 7. Status Transition Validation
```typescript
import { validateStatusTransition, CALL_STATUS_TRANSITIONS } from './utils/statusTransitions';

// Automatically validates transitions
validateStatusTransition('initiated', 'connected', CALL_STATUS_TRANSITIONS, 'Call');
// Throws BadRequestError if invalid transition
```

## Environment-Specific Behavior

### Development
- Debug logs enabled
- Swagger enabled
- Detailed errors
- No rate limiting
- 10MB file limit
- Email not required

### Production
- Debug logs disabled
- Swagger disabled
- Generic errors
- Rate limiting enabled
- 5MB file limit
- Email verification required
- Stricter password requirements

## Testing

### Test Email Configuration
```bash
# Use a test SMTP service like Mailtrap or Gmail
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your_mailtrap_user
SMTP_PASSWORD=your_mailtrap_password
```

### Test File Upload
```bash
curl -X POST http://localhost:4000/api/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/file.jpg"
```

### Test Status Transitions
```typescript
// This should work
await callSessionService.updateCallStatus(callId, userId, 'ringing');

// This should fail (invalid transition)
await callSessionService.updateCallStatus(callId, userId, 'ended');
// Error: Cannot transition Call from 'initiated' to 'ended'
```

## Troubleshooting

### Email Not Sending
1. Check SMTP credentials in `.env`
2. Enable "Less secure app access" for Gmail
3. Use app-specific password for Gmail
4. Check email service logs

### File Upload Fails
1. Ensure `uploads` directory exists
2. Check file size limits
3. Verify MIME type is allowed
4. Check disk space

### Migration Fails
1. Check database connection
2. Ensure user has CREATE TABLE permissions
3. Check for existing tables with same names
4. Review migration SQL for syntax errors

## Next Steps

1. Implement the new API endpoints in controllers
2. Add route handlers with proper middleware
3. Test email flows with real SMTP
4. Test file uploads with various file types
5. Add frontend integration for new features
6. Set up cron jobs for cleanup tasks

## Maintenance Tasks

### Recommended Cron Jobs
```typescript
// Clean expired tokens (daily)
DELETE FROM email_verifications WHERE expires_at < NOW();
DELETE FROM password_resets WHERE expires_at < NOW();

// Permanent delete expired recoveries (daily)
SELECT original_user_id FROM deleted_users 
WHERE recovery_expires_at < NOW() AND can_recover = 'yes';
// Then call permanentlyDeleteUser() for each
```

## Security Notes

1. All tokens use 256-bit entropy (crypto.randomBytes(32))
2. Tokens are single-use (password reset)
3. Short expiration times (1-24 hours)
4. File uploads validated by MIME type and size
5. Status transitions prevent invalid state changes
6. Soft delete preserves audit trail

## Support

For issues or questions:
1. Check PHASE2_IMPLEMENTATION.md for detailed documentation
2. Review error logs in `logs/` directory
3. Check database schema matches migration
4. Verify environment variables are set correctly
