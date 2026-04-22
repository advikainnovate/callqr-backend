# Calls And WebRTC

> Covers QR-based call initiation, WebRTC signaling, timeout handling, and push fallback.

## Core Flow

1. Caller scans QR and creates a call with `POST /api/calls/initiate`
2. Caller emits `initiate-call` over Socket.IO
3. Receiver gets `incoming-call` by socket or push
4. Receiver accepts or rejects
5. Offer / answer / ICE flow happens over granular socket events
6. Either side ends the call, or the stale-call sweeper times it out

## ICE Config

```http
GET /api/webrtc/config
```

Notes:

- Requires authentication
- Works for authenticated users and guest-authenticated requests
- Returns STUN/TURN config for `RTCPeerConnection`

## Socket Setup

```js
const socket = io('wss://your-domain.com', {
  path: '/socket.io',
  transports: ['websocket'],
  auth: { token: accessToken },
});
```

Guest example:

```js
const socket = io('wss://your-domain.com', {
  path: '/socket.io',
  transports: ['websocket'],
  auth: { guestId: localStorage.getItem('guestId') },
});
```

## Signaling Events

Client to server:

- `initiate-call`
- `accept-call`
- `reject-call`
- `end-call`
- `webrtc-offer`
- `webrtc-answer`
- `webrtc-ice-candidate`

Server to client:

- `incoming-call`
- `call-accepted`
- `call-connected`
- `call-rejected`
- `call-ended`
- `webrtc-offer`
- `webrtc-answer`
- `webrtc-ice-candidate`

## Queued Signaling Behavior

If only one peer is in the call room:

- Offer / answer / ICE are queued
- When the missing peer joins, queued signals are replayed only to that joining socket
- Old queued signals are not broadcast back to the sender anymore

This means:

- the caller can start signaling before the receiver fully joins
- the receiver still gets the queued offer/ICE on join
- clients should no longer rely on filtering their own replayed signals during queue flush

## Timeout & Reliability Behavior

- **Global Sweet**: Unanswered calls are timed out by the global stale-call sweeper (ringing > 60s). Reason: `timeout`.
- **Disconnection Grace Period**: If a participant's socket drops during an active call, the server **waits 30 seconds** before ending the call. This handles app backgrounding and brief network flickers.
- **Reconnection**: If the user re-establishes a socket within these 30s, the cleanup is canceled and signaling resumes (via queued signals).
- **Mutual Disconnect**: If BOTH participants are offline, the window shrinks to 10s.
- **Reason**: Calls ending due to persistent disconnection are marked with `endedReason: network_lost`.

## REST Endpoints

| Method  | Endpoint                    | Notes                 |
| ------- | --------------------------- | --------------------- |
| `POST`  | `/api/calls/initiate`       | Create a call session |
| `GET`   | `/api/calls/:callId`        | Get call details      |
| `PATCH` | `/api/calls/:callId/accept` | Socket is preferred   |
| `PATCH` | `/api/calls/:callId/reject` | Socket is preferred   |
| `PATCH` | `/api/calls/:callId/end`    | Socket is preferred   |
| `GET`   | `/api/calls/history/all`    | Call history          |
| `GET`   | `/api/calls/active/list`    | Active calls          |
| `GET`   | `/api/calls/usage/stats`    | Usage stats           |
| `GET`   | `/api/webrtc/config`        | ICE server config     |

## Call Status Notes

- Normal hang-up now records `endedReason: completed`
- Rejected calls record `endedReason: rejected`
- Timeout cleanup clears queued signals for the call

## Push Fallback & Wake-up

1. **Initial Fallback**: If the receiver is offline during initiation, a high-priority push is sent instantly.
2. **Wake-up Push**: If an active participant's socket drops, the server waits **3 seconds**. If they are still disconnected, it sends a "wake-up" push notification with `reconnect: "true"` to force the app to reconnect its socket.

See [PUSH_NOTIFICATIONS.md](./PUSH_NOTIFICATIONS.md) for data payload details.
