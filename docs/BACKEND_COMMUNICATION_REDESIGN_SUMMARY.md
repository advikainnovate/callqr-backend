# Backend Communication Redesign Summary

This document summarizes the backend stabilization work completed for the call, chat, message, and related realtime flows.

## Why this work was needed

The communication layer had become fragile because:

- guest support had been added into calls without one clean identity model
- call state changes were too open and too client-driven
- call reads were not consistently permission-checked
- messages accepted public types that were not actually supported safely
- REST and socket behavior had started drifting apart

The goal of this pass was not to redesign the whole app, but to make the current backend stable, predictable, and safer for incremental feature work.

## Product rules frozen in this pass

- Guests are call-only actors.
- Guests do not use messages or chats.
- Calls are participant-guarded.
- Call actions are role-aware.
- Messages are registered-user only.
- Public messages support only `text` and `image`.
- REST remains the persisted source of truth.
- Socket events should reflect valid persisted state, not invent it.

## Call module changes

## Access and authorization

- Added participant-only access for fetching call records.
- Centralized actor parsing for registered users, guests, and system actors.
- Prevented non-participants from reading or mutating arbitrary call records.

Key file:

- `src/services/callSession.service.ts`

## Call lifecycle tightening

- Moved call transition rules into the service layer.
- Restricted generic status updates to safe public transitions.
- Enforced receiver-only accept/reject.
- Prevented callers from forcing calls into `connected`.
- Prevented invalid transitions on finished calls.

## Call identity cleanup

- Normalized guest and user actor handling inside call services.
- Fixed target resolution in WebRTC so replies route correctly back to a registered caller or guest caller.

## Call response contract

- Added `callerName` and `receiverName` to main call responses.
- Added anonymous caller fallback for guests.
- Returned `initiatedAt` consistently alongside `startedAt` where relevant.
- Added `completed` as a valid successful end reason.

## Call reporting and counting

- Switched call ordering/history/reporting to use `initiatedAt` for attempt timelines.
- Kept duration logic based on `startedAt` and `endedAt`.
- Aligned daily call counting and subscription call usage to `initiatedAt`.

## Message module changes

## Public API restrictions

- Reduced public message types to `text` and `image`.
- Rejected unsupported public `system` and `file` message creation.
- Required uploaded images for `image` messages.

Key files:

- `src/services/message.service.ts`
- `src/schemas/message.schema.ts`
- `src/controllers/message.controller.ts`

## Query and pagination hardening

- Added bounded validation for message `limit` and `offset`.
- Added required search query validation.
- Normalized controller parsing so invalid values do not leak into DB queries.

## Data consistency improvements

- Fixed unread totals to count across all chats rather than a paginated chat subset.
- Kept sender display names in message payloads for frontend display.
- Cleaned push preview behavior for non-text messages.

## Chat/session cleanup

- Bounded chat list limit validation.
- Made non-participant chat access fail like a real forbidden path instead of returning a success-shaped 403 payload.

## Realtime / WebRTC changes

## Call realtime behavior

- Reused the tightened call authorization rules for WebRTC signaling.
- Kept signaling tied to participant-verified call access.
- Preserved call room behavior while fixing guest/user target routing.

## Chat/message realtime behavior

- Read receipts now persist message read state before broadcasting.
- Typing events are now blocked for non-participants.
- Chat room joins already require membership and remain aligned with REST rules.

Key file:

- `src/services/webrtc.service.ts`

## Tests added or updated

Added focused service-level safety coverage for the communication layer:

- `src/services/__tests__/callSession.service.test.ts`
- `src/services/__tests__/message.service.test.ts`
- `src/services/__tests__/webrtc.realtime.test.ts`
- `src/services/__tests__/webrtc.shutdown.test.ts`

These tests cover:

- non-participant call access denial
- receiver-only accept behavior
- preventing caller-forced `connected`
- guest caller behavior boundaries
- normal successful `completed` call endings
- unsupported message types
- image messages without files
- unread count regression protection
- read-receipt persistence before broadcast
- typing-event membership checks

## Secondary consistency cleanup

- Aligned fallback subscription responses to lowercase plan values.
- Kept no-subscription payloads shape-stable with null timestamps.
- Updated route docs/comments-in-code where they clearly drifted from current behavior.

## Verification completed

Verified during this pass:

- `npm run build`
- focused Jest suites for call/message/realtime safety

Most recent focused green set:

- `callSession.service.test.ts`
- `message.service.test.ts`
- `webrtc.realtime.test.ts`

Note:

- Jest still needs `--forceExit` in focused runs because there are remaining open-handle/test-harness cleanup issues outside the main communication redesign scope.
- One older integration profile test was quarantined because the local DB schema in this workspace is missing `emergency_contact`.

## Files most important to understand

- `src/services/callSession.service.ts`
- `src/controllers/call.controller.ts`
- `src/services/webrtc.service.ts`
- `src/services/message.service.ts`
- `src/controllers/message.controller.ts`
- `src/controllers/chatSession.controller.ts`
- `src/schemas/call.schema.ts`
- `src/schemas/message.schema.ts`
- `src/schemas/chatSession.schema.ts`
- `src/services/subscription.service.ts`
- `src/services/admin.service.ts`

## Outcome

The communication backend is now much closer to the intended product model:

- guest calls are supported cleanly
- guest messaging is blocked cleanly
- call transitions are safer
- call and message payloads are more frontend-friendly
- unread counts and realtime read flows are more trustworthy
- the backend contract is stable enough for frontend alignment and future feature work
