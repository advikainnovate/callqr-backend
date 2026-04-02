# WebRTC Call Flow & Identity Architecture

This document describes how identities and signaling are handled in the CallQR system, specifically addressing the interaction between Registered Users and Anonymous Guests.

## 1. Identity Rules

The system uses a unified identity normalization layer in the backend to ensure consistent authorization and signaling.

| Source              | Raw Format (Socket) | Normalized Format (Internal/DB) |
| :------------------ | :------------------ | :------------------------------ |
| **Registered User** | `[UUID]`            | `[UUID]`                        |
| **Anonymous Guest** | `guest:[ID]`        | `[ID]`                          |

> [!NOTE]
> The `guest:` prefix is only used for identification during the Socket.IO handshake. The backend strips this prefix immediately using `normalizeUserId` before any database queries or authorization checks.

---

## 2. 4-Stage Call Flow

### Stage 1: Session Creation (REST)

The caller (Guest or User) hits the `/api/calls/initiate` endpoint.

- **Input**: `qrToken`
- **Output**: `callId`, `status: "initiated"`
- **Result**: A record is created in the `call_sessions` table with `callerId` (for users) or `guestId` (for guests).

### Stage 2: Socket Connection & Room Join

The caller connects to the Socket server.

- **Handshake**: Authentication via JWT (User) or `guestId` (Guest).
- **Event**: `initiate-call { callId }`
- **Actions**:
  1. Authorization check ensures the socket's normalized ID matches the caller in the DB.
  2. Socket joins the room `call:[callId]`.
  3. Receiver is notified via `incoming-call` event (Socket) or Push Notification (Firebase).

### Stage 3: Receiver Acceptance

The receiver accepts the call.

- **Event**: `accept-call { callId }`
- **Actions**:
  1. Authorization check ensures the socket's ID matches the `receiverId` in the DB.
  2. Socket joins the room `call:[callId]`.
  3. Status updated to `connected`.
  4. `call-accepted` event broadcast to the room.

### Stage 4: WebRTC Negotiation (Signaling)

Once both parties are in the `call:[callId]` room, the Peer-to-Peer handshake begins.

- **Offers/Answers**: Transmitted via `webrtc-offer` and `webrtc-answer`.
- **ICE Candidates**: Transmitted via `webrtc-ice-candidate` (or fallback `webrtc-signal`).
- **Authorization**: EVERY signal is validated to ensure the sender is a participant in that specific `callId`.

---

## 3. Common Failure Modes & Debugging

### "No Voice" / ICE Failures

If signaling events are sent but no audio is heard, it is usually an **ICE Candidate** failure.

- **Cause**: The `webrtc-ice-candidate` or fallback `webrtc-signal` was rejected as "Unauthorized".
- **Fix**: Ensure the `isAuthorizedForCall` helper is used in all signaling handlers.

### "Signal Not Received" / Room Failures

If the caller sends an offer but the receiver never sees it:

- **Cause**: One of the parties failed to join the `call:[callId]` room.
- **Debug**: Check backend logs for `[Room] ... joined call:...`. If one is missing, negotiation cannot start.

### "Unauthorized signaling attempt"

- **Cause**: The socket ID doesn't match the DB record (e.g., prefix was not stripped, or a different guest ID was used).
- **Debug**: Verify the `guestId` stored in the `call_sessions` table matches the `guestId` sent in the socket handshake.

---

## 4. Structured Logging

The backend logs signaling events in the following format for easier tracing:
`[Signal] Forwarding [type] { callId: ..., from: ..., type: ... }`
