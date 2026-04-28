# Authentication

> Covers registration, phone verification, login, password reset, and profile access.

## Registration Flow

1. `POST /api/auth/register`
2. Backend creates the user with `status: pending_verification`
3. Verification starts immediately:
   - `+91` numbers use Exotel missed-call verification when `EXOTEL_MCV_NUMBER` is configured
   - all other numbers use OTP over SMS
4. User can log in immediately
5. Client should redirect unverified users to the verification screen
6. For OTP users, `POST /api/auth/verify-phone` activates the account
7. For missed-call users, Exotel calls `POST /api/auth/exotel-webhook` and the backend activates the account

### Register

```http
POST /api/auth/register
```

```json
{
  "username": "john_doe",
  "password": "secret123",
  "phone": "+919876543210",
  "email": "j@example.com",
  "emergencyContact": "Jane Doe"
}
```

Notes:

- `phone` is required
- `email` is optional
- `emergencyContact` is currently optional
- Newly registered users start as `pending_verification`

Example response:

```json
{
  "success": true,
  "message": "Registration successful. Please verify your phone number.",
  "data": {
    "token": "eyJ...",
    "user": {
      "id": "uuid",
      "username": "john_doe",
      "status": "pending_verification",
      "isPhoneVerified": false
    },
    "verificationType": "missed_call",
    "mcvNumber": "09513886363",
    "message": "Give a missed call to the verification number to activate your account."
  }
}
```

## Login

```http
POST /api/auth/login
```

```json
{
  "username": "john_doe",
  "password": "secret123"
}
```

Current behavior:

- Unverified users can log in
- Login response includes verification metadata for the client
- The client should route unverified users to the correct verification flow immediately
- Accounts left unverified for more than 7 days are soft-deleted on login attempt

Example response:

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJ...",
    "user": {
      "id": "uuid",
      "username": "john_doe",
      "status": "pending_verification",
      "isPhoneVerified": false,
      "createdAt": "2026-04-17T10:00:00.000Z"
    },
    "verification": {
      "required": true,
      "hint": "Use POST /api/auth/resend-phone-verification to restart phone verification"
    }
  }
}
```

Login fails if:

- account is globally blocked
- account is `deleted`
- verification window has expired and the backend soft-deletes the pending account

## Phone Verification

### Verification Modes

- Indian numbers (`+91`) use Exotel missed-call verification when `EXOTEL_MCV_NUMBER` is configured
- International numbers use OTP verification through SMS
- The backend still creates a 10-minute verification window for both modes

### Verify Phone

```http
POST /api/auth/verify-phone
Authorization: Bearer <token>
```

```json
{
  "otp": "123456"
}
```

Successful verification sets:

- `isPhoneVerified = true`
- `status = active` if the user was `pending_verification`
- This endpoint is used only for OTP verification

### Exotel Webhook

```http
POST /api/auth/exotel-webhook
Content-Type: application/x-www-form-urlencoded
```

Example body:

```text
From=+919876543210&CallStatus=no-answer
```

Notes:

- This is a public Exotel callback endpoint
- The frontend does not call this endpoint directly in production
- The backend verifies the user automatically when the missed call matches a pending verification

### Restart Verification

```http
POST /api/auth/resend-phone-verification
Authorization: Bearer <token>
```

Response behavior:

- For `+91` numbers, returns `verificationType: "missed_call"` and `mcvNumber`
- For international numbers, returns `verificationType: "otp"`

### Start Phone Verification For Existing User

```http
POST /api/auth/send-phone-verification
Authorization: Bearer <token>
```

```json
{
  "phone": "+919876543210"
}
```

Response behavior:

- For `+91` numbers, returns `verificationType: "missed_call"` and `mcvNumber`
- For international numbers, sends OTP and returns `verificationType: "otp"`

### Check Verification Status

```http
GET /api/auth/phone-verification-status
Authorization: Bearer <token>
```

## Password Reset

### Request OTP

```http
POST /api/auth/forgot-password
```

### Reset Password

```http
POST /api/auth/reset-password
```

## Profile

```http
GET /api/auth/profile
Authorization: Bearer <token>
```

Profile now includes QR image URLs in the `qrCodes.codes[]` payload so the frontend can render the backend-generated QR image directly.

## User Statuses

| Status                 | Can Login | Description                           |
| ---------------------- | --------- | ------------------------------------- |
| `pending_verification` | Yes       | Registered but phone not verified yet |
| `active`               | Yes       | Verified and active                   |
| `blocked`              | No        | Blocked by admin                      |
| `deleted`              | No        | Soft-deleted account                  |

## Security Notes

- Passwords use `bcrypt`
- Phone and email fields are encrypted at rest
- OTPs are stored hashed
- OTP expiry is 10 minutes
- JWT uses the configured server secret
