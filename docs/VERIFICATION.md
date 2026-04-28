# Phone Verification Flow

This document is for the frontend team. It explains the current phone verification behavior, which API responses to expect, and what client changes are required.

## Overview

Phone verification now has two modes:

- India numbers (`+91`) use Exotel missed-call verification
- International numbers use OTP verification over SMS

Twilio should be treated as the international SMS path only.

## Backend Decision Rules

The backend decides the verification mode from the phone number:

- If the phone starts with `+91` and `EXOTEL_MCV_NUMBER` is configured:
  - response includes `verificationType: "missed_call"`
  - response includes `mcvNumber`
  - user must place a missed call to that number
  - backend verifies the account after Exotel hits `/api/auth/exotel-webhook`
- Otherwise:
  - response includes `verificationType: "otp"`
  - backend sends an OTP by SMS
  - frontend must collect the OTP and call `/api/auth/verify-phone`

## Endpoints The Frontend Uses

### 1. Register

`POST /api/auth/register`

Example response for India:

```json
{
  "success": true,
  "message": "Registration successful. Please verify your phone number.",
  "data": {
    "token": "jwt_token",
    "user": {
      "id": "user_id",
      "username": "john_doe",
      "status": "pending_verification",
      "isPhoneVerified": false,
      "createdAt": "timestamp"
    },
    "verificationType": "missed_call",
    "mcvNumber": "09513886363",
    "message": "Give a missed call to the verification number to activate your account."
  }
}
```

Example response for international:

```json
{
  "success": true,
  "message": "Registration successful. Please verify your phone number.",
  "data": {
    "token": "jwt_token",
    "user": {
      "id": "user_id",
      "username": "john_doe",
      "status": "pending_verification",
      "isPhoneVerified": false,
      "createdAt": "timestamp"
    },
    "verificationType": "otp",
    "message": "An OTP has been sent to your phone number. Please verify to activate your account."
  }
}
```

### 2. Login

`POST /api/auth/login`

If the user is still unverified, the response includes:

```json
{
  "verification": {
    "required": true,
    "hint": "Use POST /api/auth/resend-phone-verification to restart phone verification"
  }
}
```

Frontend behavior:

- if `verification.required` is `true`, route the user to the verification screen
- do not assume OTP only
- call `GET /api/auth/phone-verification-status` if you need to show the masked phone

### 3. Restart Verification

`POST /api/auth/resend-phone-verification`

Example response for India:

```json
{
  "success": true,
  "message": "Please give a missed call to verify your number.",
  "mcvNumber": "09513886363",
  "verificationType": "missed_call"
}
```

Example response for international:

```json
{
  "success": true,
  "message": "Verification code resent to your phone",
  "verificationType": "otp"
}
```

### 4. Verify OTP

`POST /api/auth/verify-phone`

Use this only when `verificationType === "otp"`.

### 5. Poll Verification Status

`GET /api/auth/phone-verification-status`

Example response:

```json
{
  "success": true,
  "data": {
    "hasPhone": true,
    "isPhoneVerified": false,
    "phone": "+91****3210"
  }
}
```

The frontend should use this endpoint to confirm when missed-call verification is complete.

## Required Frontend Changes

1. Treat verification as a mode-based flow, not OTP-only.
2. Read `verificationType` from:
   - `register.data.verificationType`
   - `send-phone-verification.verificationType`
   - `resend-phone-verification.verificationType`
3. If `verificationType === "missed_call"`:
   - show the returned `mcvNumber`
   - show instructions to place a missed call from the same phone number
   - hide the OTP entry form
   - poll `GET /api/auth/phone-verification-status` every few seconds until verified, or let the user tap a refresh button
4. If `verificationType === "otp"`:
   - show the OTP input UI
   - submit the OTP to `POST /api/auth/verify-phone`
5. Keep the user on a verification screen after login when `verification.required === true`.

## Recommended UX

For missed-call verification:

- show the verification number prominently
- explain that the missed call must be placed from the same registered number
- explain that verification expires in 10 minutes
- add a `Refresh status` button
- add a `Resend / Restart verification` action that calls `POST /api/auth/resend-phone-verification`

For OTP verification:

- show OTP input
- show resend action
- show an OTP expiry message

## Suggested Polling Behavior

For missed-call verification, a simple approach is:

- start polling `GET /api/auth/phone-verification-status` every 5 seconds
- stop polling when `isPhoneVerified` becomes `true`
- also stop polling after 10 minutes or when the user leaves the screen

## Important Notes

- Exotel webhook verification is handled by the backend only
- The frontend should never call `/api/auth/exotel-webhook` in production
- Registration and resend now follow the same India-vs-international rule
- Password reset is still OTP-based and is separate from this signup verification flow
