# Phone Verification Now Required

## What Changed

Phone verification is now MANDATORY during registration. Users cannot login until they verify their phone number.

## New Registration Flow

### 1. Register (Phone Required)
```bash
POST /api/auth/register
{
  "username": "john_doe",
  "password": "password123",
  "phone": "+918005936038"  # REQUIRED
}
```

**Response:**
- User created with status: `pending_verification`
- OTP sent immediately to phone
- Returns JWT token (for verification endpoint)
- User CANNOT login yet

### 2. Verify Phone (Required Before Login)
```bash
POST /api/auth/verify-phone
Authorization: Bearer <token_from_registration>
{
  "otp": "123456"
}
```

**Response:**
- Phone marked as verified
- User status changed to `active`
- User can now login

### 3. Login (Only After Verification)
```bash
POST /api/auth/login
{
  "username": "john_doe",
  "password": "password123"
}
```

**Success:** Returns JWT token
**Failure:** If phone not verified:
```json
{
  "success": false,
  "message": "Please verify your phone number before logging in"
}
```

## User Statuses

| Status | Can Login? | Description |
|--------|-----------|-------------|
| `pending_verification` | ❌ No | Just registered, phone not verified |
| `active` | ✅ Yes | Phone verified, account active |
| `blocked` | ❌ No | Account blocked by admin |
| `deleted` | ❌ No | Account deleted |

## Resend OTP

If user didn't receive OTP:
```bash
POST /api/auth/resend-phone-verification
Authorization: Bearer <token>
```

## Migration Impact

### Existing Users
- Old users (registered before this change) have status: `active`
- They can continue to login normally
- Phone verification is optional for them

### New Users
- Must provide phone number
- Must verify phone before login
- Cannot use the system until verified

## Testing

### Test Registration Flow
```bash
# 1. Register
curl -X POST http://localhost:9001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "password123",
    "phone": "+918005936038"
  }'

# Response includes token and message about OTP

# 2. Check server console for OTP (dev mode)
# Or check your phone for SMS (production)

# 3. Verify phone
curl -X POST http://localhost:9001/api/auth/verify-phone \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"otp": "123456"}'

# 4. Now login works
curl -X POST http://localhost:9001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "password123"
  }'
```

## Benefits

✅ Verified phone numbers for all new users
✅ Reduces fake accounts
✅ Ensures users can receive important notifications
✅ Better security and user verification
✅ Existing users not affected

## Deployment

No database migration needed! The existing schema already supports this:
- `status` field exists (active, pending_verification, blocked, deleted)
- `isPhoneVerified` field exists
- `phoneVerificationCode` and `phoneVerificationExpires` fields exist

Just deploy the code and restart:
```bash
git pull
npm install
npm run build
pm2 restart callqr-backend
```

## Rollback

If you need to make phone optional again, revert these files:
- `src/controllers/auth.controller.ts`
- `src/controllers/phone-verification.controller.ts`
- `src/services/user.service.ts`
