# ⚡ Rate Limiting

> Two layers of protection: connection-level (IP-based) and per-event (user-based).

---

## Layer 1 — Connection Rate Limiter (IP-based)

Applied before authentication at socket connect time.

| Limit           | Value                                                                 |
| --------------- | --------------------------------------------------------------------- |
| Max connections | 10 per minute per IP                                                  |
| On exceed       | Connection rejected: `"Too many connections. Retry after X seconds."` |

---

## Layer 2 — Socket Event Rate Limiter (per-user)

Applied after authentication, per socket event type.

| Event                                                     | Limit | Window     |
| --------------------------------------------------------- | ----- | ---------- |
| `webrtc-signal`                                           | 100   | 60 seconds |
| `initiate-call`, `accept-call`, `reject-call`, `end-call` | 20    | 60 seconds |
| `chat-message`                                            | 30    | 60 seconds |
| `typing-start`, `typing-stop`                             | 20    | 10 seconds |
| `join-chat`, `leave-chat`                                 | 30    | 60 seconds |
| `message-read`                                            | 50    | 60 seconds |

---

## Flow

```
Client emits event
        │
        ▼
socket.use() middleware
  → identifies event type
  → selects rate limit profile
        │
        ▼
SocketRateLimiter.check(userId, event)
        │
   ┌────┴────┐
Within limit?
   │        │
  YES       NO
   │        │
Increment   Emit "rate-limit-exceeded" to client
counter     (event, message, retryAfter)
   │        Block the event
Execute
handler
```

---

## Client-side Handling

Listen for the `rate-limit-exceeded` event and back off:

```javascript
socket.on('rate-limit-exceeded', ({ event, message, retryAfter }) => {
  console.warn(`Rate limited on "${event}" — retry after ${retryAfter}s`);
  showToast(message);

  // Don't emit that event again until retryAfter has passed
  blockEvent(event, retryAfter * 1000);
});
```

### Recommended: client-side throttle for typing

```javascript
// Throttle to at most 1 event per 2 seconds to avoid hitting the limit
const emitTypingStart = throttle(
  () => socket.emit('typing-start', { chatSessionId }),
  2000
);
```

---

## HTTP Rate Limiting

Express-level limits apply to REST API routes (configured via `express-rate-limit`). Check `src/middleware/` for current values.

---

## Attack Prevention

| Typing spam | Event overload | Max 20/10s |

---

## Socket Reliability (Heartbeats)

To detect dead connections and backgrounded mobile apps faster, the system uses aggressive heartbeat settings:

| Property       | Value | Purpose                                      |
| -------------- | ----- | -------------------------------------------- |
| `pingInterval` | 10s   | Frequency of server pings to client          |
| `pingTimeout`  | 5s    | Max wait time for pong before closing socket |

These settings ensure that a "zombie" connection is detected within 15 seconds, allowing the **Call Reconnection Grace Period** to start correctly.

---

## Internal Cleanup

The rate limiter runs a cleanup interval every **60 seconds** to free expired entries from memory. On server shutdown, `rateLimiter.destroy()` is called to clear the interval and prevent memory leaks.

---

## Subscription-based Limits (separate)

These are daily business limits tracked in the database, separate from real-time rate limiting:

|                | FREE | PRO | ENTERPRISE |
| -------------- | ---- | --- | ---------- |
| Daily calls    | 20   | 80  | ∞          |
| Daily messages | 100  | 500 | ∞          |
| Active chats   | 5    | 20  | ∞          |

Exceeding these returns `429 Too Many Requests` from the REST API.
