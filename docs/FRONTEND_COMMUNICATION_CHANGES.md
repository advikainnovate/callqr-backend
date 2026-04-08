# Frontend Communication Changes

This document summarizes the frontend-facing changes to the call, chat, and message backend contracts.

For call-specific flow details, also see [CALLS_UPDATE.md](./CALLS_UPDATE.md).

## Summary

The communication backend is now stricter and more consistent:

- Calls support guests, but messages do not.
- Call access is participant-only.
- Call mutations are role-aware.
- Public message types are limited to `text` and `image`.
- Query validation is stricter and more predictable.
- Realtime read receipts now persist before emitting.

## Call Changes

## Actor model

- Guests are supported in calls only.
- Guests cannot access message or chat endpoints.
- The receiver in a call is always a registered user.

## Call response fields

Main call endpoints now return display-ready names and clearer timestamps.

Common fields:

- `callerId`
- `guestId`
- `receiverId`
- `callerName`
- `receiverName`
- `status`
- `initiatedAt`
- `startedAt`
- `endedAt`
- `endedReason`

Notes:

- `callerName` is returned by the backend for frontend display.
- Guest callers use `callerName: "Anonymous Caller"`.
- `startedAt` is optional and may be `null` until the call is actually connected.
- Use `initiatedAt` as the call creation / attempt timestamp.

## Call endpoint behavior

Use these routes according to intent:

- `POST /api/calls/initiate`
  - creates the call record
  - returns names and timestamps
- `GET /api/calls/:callId`
  - participant-only
  - safe source of truth for call details
- `PATCH /api/calls/:callId/status`
  - only use for pending-state updates
  - public schema only allows `ringing` and `connected`
- `PATCH /api/calls/:callId/accept`
  - preferred receiver action for accepting a call
- `PATCH /api/calls/:callId/reject`
  - preferred receiver action for rejecting a call
- `PATCH /api/calls/:callId/end`
  - use when a participant ends a call

## Call action expectations

Frontend should assume these rules:

- Only the receiver can accept or reject.
- Caller cannot force a call into connected state.
- Guests can initiate and participate in calls, but only within that call.
- Non-participants cannot fetch or mutate call records.

## Call end reasons

Supported end reasons now include:

- `busy`
- `rejected`
- `timeout`
- `error`
- `completed`

Use `completed` for a normal successful hangup.

## Call history / active calls

Call history and active call payloads now also include:

- `callerName`
- `receiverName`
- `initiatedAt`
- `startedAt`

Frontend should stop inferring guest labels locally if possible and use the backend-provided `callerName`.

## Message Changes

## Message actor model

- Messages are registered-user only.
- Guests must not call message or chat APIs.

## Public message types

Public API now supports only:

- `text`
- `image`

Do not send:

- `system`
- `file`

Those are no longer valid public request values.

## Image message rules

For `messageType: "image"`:

- at least one uploaded image is required
- `content` is optional and acts like a caption

If no image files are uploaded, the backend rejects the request.

## Message send response

Message send / fetch responses include:

- `id`
- `chatSessionId`
- `senderId`
- `senderName`
- `messageType`
- `content`
- `mediaAttachments`
- `isDelivered`
- `isRead`
- `sentAt`
- `deliveredAt`
- `readAt`

Frontend can use `senderName` directly instead of resolving it separately.

## Pagination and search

The backend now enforces tighter query validation:

- message `limit`: `1..100`
- message `offset`: `>= 0`
- chat list `limit`: `1..100`
- call history `limit`: `1..100`
- search `query` is required

Frontend should stop sending empty search strings and should keep pagination inside those bounds.

## Unread counts

Unread totals are now counted across all chats correctly, not just the first paginated set of chats.

Frontend can trust `GET /api/messages/unread/count` more than before for badge totals.

## Realtime / socket behavior

## Chat sockets

Socket chat actions now follow membership rules more strictly:

- non-participants cannot join chat rooms
- non-participants cannot emit typing events successfully
- read receipts now persist before broadcast

Frontend should treat socket events as reflections of persisted state, not as a separate source of truth.

## Practical frontend checklist

- Use backend `callerName` and `receiverName` for call UI.
- Treat guest callers as display-only `Anonymous Caller` unless product wants a different label later.
- Use `initiatedAt` for call list ordering and attempt time display.
- Use `startedAt` only for connected-call timing or duration UI.
- Use `accept` / `reject` routes for receiver decisions instead of generic status mutation where possible.
- Only send message types `text` and `image`.
- Always attach actual files for image messages.
- Keep message/chat/call pagination values within backend limits.
- Treat unread badge totals as authoritative from `/api/messages/unread/count`.
- Do not expose message/chat UI to guests.

## Migration notes

If the current frontend still:

- sends `system` or `file` as public message types
- assumes uppercase subscription plan values
- infers guest caller labels itself
- treats `startedAt` as the created timestamp for every call

those assumptions should be updated now.
