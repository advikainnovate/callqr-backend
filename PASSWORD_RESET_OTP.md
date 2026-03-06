# Password Reset with OTP Verification

## ✅ Implementation Complete!

Password reset now requires OTP verification via SMS for enhanced security.

## What Changed

### Old Flow (Email-Based) ❌
1. User provides email
2. Reset token sent via email
3. User clicks link
4. Sets new password

### New Flow (OTP-Based) ✅
1. User provides username
2. OTP sent to verified phone via SMS
3. User enters OTP + new password
4. Password updated

## New Endpoints

### 1. Request Password Reset
```bash
POST /api/auth/forgot-password
Body: { "username": "john_doe" }

Response: {
  "userId": "abc-123",
  "message": "OTP sent to your registered phone number"
}
```

### 2. Reset Password with OTP
```bash
POST /api/auth/reset-password
Body: {
  "userId": "abc-123",
  "otp": "123456",
  "newPassword": "newpass123"
}

Response: {
  "message": "Password reset successful"
}
```

## Security Benefits

✅ **Phone Verification Required** - User must have access to registered phone  
✅ **No Email Interception** - No tokens sent via email  
✅ **Short Expiry** - OTP expires in 10 minutes  
✅ **Hashed Storage** - OTP stored as SHA-256 hash  
✅ **One-Time Use** - OTP cleared after successful use  
✅ **Same System** - Uses same OTP system as registration  

## Requirements

- User must have verified phone number
- Phone verification completed during registration
- Twilio configured for SMS delivery

## Testing

### Development Mode (Console OTP)
```bash
# 1. Request reset
curl -X POST http://localhost:9001/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser"}'

# Check console for OTP: 📱 SMS OTP for +918005936038: 123456

# 2. Reset with OTP
curl -X POST http://localhost:9001/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-id-from-response",
    "otp": "123456",
    "newPassword": "newpass123"
  }'

# 3. Login with new password
curl -X POST http://localhost:9001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "newpass123"}'
```

### Production Mode (Real SMS)
Same steps, but OTP sent via SMS to user's phone.

## Updated Files

- ✅ `src/controllers/auth.controller.ts` - New forgot/reset logic
- ✅ `src/services/user.service.ts` - Added resetPasswordWithUserId method
- ✅ `API_ENDPOINTS.md` - Updated documentation
- ✅ `docs/FORGOT_PASSWORD_FLOW.md` - Complete flow guide
- ✅ `bruno/Authentication/Forgot Password.bru` - API test
- ✅ `bruno/Authentication/Reset Password.bru` - API test

## Migration Impact

### Existing Users
- Must have verified phone to reset password
- If no verified phone: Contact support

### New Users
- Phone verified during registration
- Can reset password using OTP immediately

## Error Handling

### No Verified Phone
```json
{
  "success": false,
  "message": "No verified phone number found for this account. Please contact support."
}
```

### Invalid OTP
```json
{
  "success": false,
  "message": "Invalid verification code."
}
```

### Expired OTP
```json
{
  "success": false,
  "message": "Verification code has expired. Please request a new code."
}
```

## Deployment

No database migration needed! Uses existing phone verification fields:
- `phoneVerificationCode`
- `phoneVerificationExpires`
- `isPhoneVerified`

Just deploy and restart:
```bash
git pull
npm install
npm run build
pm2 restart callqr-backend
```

## Documentation

- **API Reference**: `API_ENDPOINTS.md`
- **Flow Details**: `docs/FORGOT_PASSWORD_FLOW.md`
- **Bruno Tests**: `bruno/Authentication/`

## Comparison

| Feature | Old (Email) | New (OTP) |
|---------|-------------|-----------|
| Verification Method | Email link | SMS OTP |
| Security | Medium | High |
| Expiry | 1 hour | 10 minutes |
| Interception Risk | High | Low |
| Phone Required | No | Yes |
| User Experience | Click link | Enter code |

## Benefits Summary

✅ More secure (phone verification)  
✅ Faster (no email delays)  
✅ Consistent (same OTP system)  
✅ Reliable (SMS delivery)  
✅ No email dependency  
✅ Prevents unauthorized resets  

---

**Status**: ✅ Ready for Production  
**Tested**: ✅ Build successful  
**Documented**: ✅ Complete  
