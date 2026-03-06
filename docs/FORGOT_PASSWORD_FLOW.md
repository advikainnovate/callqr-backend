# Forgot Password Flow (OTP-Based)

## Overview

Password reset now uses OTP verification via SMS to confirm user identity before allowing password change.

## Security Benefits

✅ Verifies user has access to registered phone  
✅ No email-based tokens that can be intercepted  
✅ OTP expires in 10 minutes  
✅ Same secure OTP system as registration  
✅ Prevents unauthorized password resets  

## Flow

### Step 1: Request Password Reset
```
POST /api/auth/forgot-password
Body: { "username": "john_doe" }
```

**What Happens:**
- System finds user by username
- Checks if user has verified phone
- Generates 6-digit OTP
- Sends OTP via SMS to registered phone
- Returns user ID for next step

**Response:**
```json
{
  "success": true,
  "message": "OTP sent to your registered phone number.",
  "data": {
    "userId": "abc-123-def",
    "message": "An OTP has been sent to your phone. Use it to reset your password."
  }
}
```

### Step 2: Verify OTP & Set New Password
```
POST /api/auth/reset-password
Body: {
  "userId": "abc-123-def",
  "otp": "123456",
  "newPassword": "newpass123"
}
```

**What Happens:**
- System verifies OTP is valid and not expired
- If valid, updates password
- Clears OTP from database
- User can now login with new password

**Response:**
```json
{
  "success": true,
  "message": "Password reset successful. You can now login with your new password."
}
```

### Step 3: Login with New Password
```
POST /api/auth/login
Body: {
  "username": "john_doe",
  "password": "newpass123"
}
```

## Error Cases

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

### User Not Found
```json
{
  "success": true,
  "message": "If an account exists, an OTP has been sent to the registered phone number."
}
```
*Note: Same response whether user exists or not (security)*

## Testing

### Development Mode (Console OTP)
```bash
# 1. Request password reset
curl -X POST http://localhost:9001/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser"}'

# Check server console for OTP
# Output: 📱 SMS OTP for +918005936038: 123456

# 2. Reset password with OTP
curl -X POST http://localhost:9001/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-id-from-step-1",
    "otp": "123456",
    "newPassword": "newpassword123"
  }'

# 3. Login with new password
curl -X POST http://localhost:9001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "newpassword123"
  }'
```

### Production Mode (Real SMS)
Same steps, but OTP is sent via SMS to user's phone.

## Comparison: Old vs New

### Old Flow (Email-Based)
1. User provides email
2. System sends reset token via email
3. User clicks link with token
4. User sets new password

**Issues:**
- ❌ Email can be compromised
- ❌ Token in URL can be intercepted
- ❌ No phone verification
- ❌ Relies on email delivery

### New Flow (OTP-Based)
1. User provides username
2. System sends OTP to verified phone
3. User enters OTP + new password
4. Password updated

**Benefits:**
- ✅ Requires phone access
- ✅ OTP expires quickly (10 min)
- ✅ No clickable links
- ✅ Same secure system as registration
- ✅ SMS delivery more reliable

## Requirements

- User must have verified phone number
- Phone verification must be completed during registration
- Twilio configured for SMS delivery

## Database Fields Used

- `phoneVerificationCode` - Stores hashed OTP
- `phoneVerificationExpires` - OTP expiry timestamp
- `isPhoneVerified` - Must be 'true' to reset password

## Security Notes

- OTP is hashed (SHA-256) before storage
- OTP expires after 10 minutes
- OTP cleared after successful use
- Username required (not email)
- Same response for existing/non-existing users
- Rate limiting recommended (prevent OTP spam)

## Migration Impact

### Existing Users
- Must have verified phone to reset password
- If no verified phone, contact support

### New Users
- Phone verified during registration
- Can reset password using OTP

## Troubleshooting

### "No verified phone number found"
- User registered before phone verification was required
- User never verified their phone
- Solution: Contact support or verify phone first

### OTP not received
- Check Twilio configuration
- Check phone number format
- Check Twilio account balance
- Check SMS logs in Twilio dashboard

### OTP expired
- Request new OTP (call forgot-password again)
- OTP valid for 10 minutes only

## Related Endpoints

- `POST /api/auth/forgot-password` - Request OTP
- `POST /api/auth/reset-password` - Verify OTP & reset
- `POST /api/auth/resend-phone-verification` - Resend OTP (if needed)
