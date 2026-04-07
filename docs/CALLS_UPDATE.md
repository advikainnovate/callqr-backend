# Call Backend Update

This document describes the current stabilized call behavior after the backend cleanup.

## What Changed

- Call access is now participant-only.
- Guest support is limited to calls only.
- Call state changes are actor-aware instead of fully generic.
- A successful hangup can now use `completed` as the end reason.
- Call responses now distinguish between:
  - `initiatedAt`: when the call record was created
  - `startedAt`: when the call was actually connected
  - `endedAt`: when the call finished
- Admin timelines and exports now use `initiatedAt` for call-attempt tracking.

## Actor Rules

### Registered User

- Can initiate a call by QR token.
- Can receive a call.
- Can accept, reject, or end a call if they are a participant.

### Guest

- Can initiate a call by QR token.
- Can participate in that call as the caller.
- Cannot access chat or message features.
- Cannot accept a call as the receiver.

### Receiver

- Must be a registered user.
- Is the only actor allowed to accept a pending call.
- Is the only actor allowed to reject a pending call.

## Call Timeline Fields

### `initiatedAt`

When the backend created the call session.

Use this for:

- call attempt history
- ordering recent calls
- admin analytics for incoming call attempts

### `startedAt`

When the call was actually connected.

Use this for:

- connected-call duration
- UI showing when conversation really began

### `endedAt`

When the call finished.

## End Reasons

Supported end reasons are:

- `busy`
- `rejected`
- `timeout`
- `error`
- `completed`

### Recommended meaning

- `rejected`: receiver declined before connection
- `timeout`: no answer / stale pending call
- `error`: disconnect or operational failure
- `completed`: call connected and ended normally
- `busy`: receiver-side busy style rejection if used by client flow

## Status Updates

The generic status endpoint is intentionally restricted now.

### `PATCH /api/calls/:callId/status`

Allowed statuses:

- `ringing`
- `connected`

Important:

- callers can move a call from `initiated` to `ringing`
- only the receiver can move a pending call to `connected`
- clients should not use this endpoint for ending or rejecting calls

### Use explicit endpoints for terminal actions

- `PATCH /api/calls/:callId/accept`
- `PATCH /api/calls/:callId/reject`
- `PATCH /api/calls/:callId/end`

## Response Shape Notes

Call responses now include display-ready name fields where applicable.

- `callerName`
- `receiverName`

For guest callers, `callerName` is returned as `Anonymous Caller`.

Call responses may now also include both `initiatedAt` and `startedAt`.

### Newly initiated call

Expected shape:

```json
{
  "callId": "uuid",
  "callerId": "uuid-or-null",
  "guestId": "guest-id-or-null",
  "receiverId": "uuid",
  "callerName": "Anonymous Caller",
  "receiverName": "Owner Username",
  "status": "initiated",
  "initiatedAt": "ISO date",
  "startedAt": null
}
```

### Connected or historical call

Expected shape:

```json
{
  "id": "uuid",
  "callerName": "Caller Username or Anonymous Caller",
  "receiverName": "Receiver Username",
  "status": "connected",
  "initiatedAt": "ISO date",
  "startedAt": "ISO date",
  "endedAt": null
}
```

## Frontend Guidance For Calls

- Treat `initiatedAt` as the created timestamp.
- Treat `startedAt` as optional until the call is connected.
- Do not assume `startedAt` exists on unanswered or rejected calls.
- Prefer backend-provided `callerName` and `receiverName` for display.
- If `callerId` is null and `guestId` is present, display should rely on `callerName`.
- Use `completed` when a connected call ends normally.
- Use explicit accept/reject/end endpoints for those actions.
- Do not let a guest client attempt receiver actions.

## Backend Guarantees Now

- Non-participants cannot fetch arbitrary call records.
- Call state transitions are role-checked.
- Guest callers cannot force acceptance.
- Receiver-only acceptance is enforced in the service layer.
- Successful call completion has a first-class backend reason.
