# Phone Verification Flow

## Overview

Phone verification system using 6-digit OTP sent via Twilio SMS.

**IMPORTANT:** Phone verification is now REQUIRED during registration. Users cannot login until their phone is verified.

## Registration & Verification Flow

### 1. User Registers
```
POST /api/auth/register
Body: { "username": "john", "password": "pass123", "phone": "+918005936038" }
```
- Phone number is REQUIRED
- OTP sent immediately
- User status: `pending_verification`
- Returns JWT token (but can't login yet)

### 2. User Verifies Phone
```
POST /api/auth/verify-phone
Authorization: Bearer <token>
Body: { "otp": "123456" }
```
- Validates OTP
- Changes status to `active`
- User can now login

### 3. User Can Login
```
POST /api/auth/login
Body: { "username": "john", "password": "pass123" }
```
- Only works if phone is verified
- Blocked if status is `pending_verification`

## API Endpoints

### 1. Send OTP
```
POST /api/auth/send-phone-verification
Authorization: Bearer <token>
Body: { "phone": "+918005936038" }
```

### 2. Verify OTP
```
POST /api/auth/verify-phone
Authorization: Bearer <token>
Body: { "otp": "123456" }
```

### 3. Resend OTP
```
POST /api/auth/resend-phone-verification
Authorization: Bearer <token>
```

### 4. Check Status
```
GET /api/auth/phone-verification-status
Authorization: Bearer <token>
```

## Setup

### Environment Variables
```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

### Database Migration
```bash
npm run db:push
```

## Features

- 6-digit OTP with 10-minute expiry
- Secure hashing (SHA-256)
- Phone encryption (AES-256-CBC)
- Development mode (console logging when Twilio not configured)
- Production mode (real SMS via Twilio)

## Flow

1. User requests OTP → System generates 6-digit code
2. OTP hashed and stored in database
3. SMS sent via Twilio (or logged to console in dev mode)
4. User enters OTP → System validates
5. Phone marked as verified

## Database Fields

- `phone_verification_code` - Hashed OTP
- `phone_verification_expires` - Expiry timestamp (10 min)
- `is_phone_verified` - Verification status

## Security

- OTPs hashed before storage
- 10-minute expiry
- One-time use (cleared after verification)
- Phone numbers encrypted in database
- All endpoints require authentication
