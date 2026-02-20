# Socket.IO Rate Limiting Implementation

## Overview

This document describes the rate limiting implementation for Socket.IO events to prevent abuse, spam, and DoS attacks.

## Protected Events

### WebRTC Signaling Events
- **Event**: `webrtc-signal`
- **Limit**: 100 requests per minute
- **Purpose**: Prevents signaling spam (offers, answers, ICE candidates)

### Call Management Events
- **Events**: `initiate-call`, `accept-call`, `reject-call`, `end-call`
- **Limit**: 20 requests per minute
- **Purpose**: Prevents call spam and abuse

### Chat Message Events
- **Event**: `chat-message`
- **Limit**: 30 messages per minute
- **Purpose**: Prevents message flooding

### Typing Indicator Events
- **Events**: `typing-start`, `typing-stop`
- **Limit**: 20 requests per 10 seconds
- **Purpose**: Prevents typing indicator spam

### Chat Room Events
- **Events**: `join-chat`, `leave-chat`
- **Limit**: 30 requests per minute
- **Purpose**: Prevents room join/leave spam

### Read Receipt Events
- **Event**: `message-read`
- **Limit**: 50 requests per minute
- **Purpose**: Prevents read receipt spam

## Connection Rate Limiting

- **Limit**: 10 connections per minute per IP address
- **Purpose**: Prevents connection exhaustion attacks

## How It Works

### 1. Connection-Level Protection
Before authentication, the system checks if the connecting IP has exceeded the connection limit.

```typescript
// Enforced in setupMiddleware()
this.connectionLimiter.allowConnection(ip);
```

### 2. Event-Level Protection
After connection, each event is rate-limited based on its type using middleware.

```typescript
// Applied per-event in setupEventHandlers()
socket.use((packet, next) => {
  const [eventName, data] = packet;
  // Apply appropriate rate limit based on event type
});
```

### 3. User Feedback
When rate limits are exceeded, clients receive a `rate-limit-exceeded` event:

```json
{
  "event": "chat-message",
  "message": "You are sending messages too quickly. Please slow down.",
  "retryAfter": 45
}
```

## Rate Limit Profiles

Defined in `src/middleware/socketRateLimit.ts`:

```typescript
export const rateLimitProfiles = {
  signaling: { windowMs: 60000, maxRequests: 100 },
  callAction: { windowMs: 60000, maxRequests: 20 },
  chatMessage: { windowMs: 60000, maxRequests: 30 },
  typing: { windowMs: 10000, maxRequests: 20 },
  chatRoom: { windowMs: 60000, maxRequests: 30 },
  readReceipt: { windowMs: 60000, maxRequests: 50 },
};
```

## Customization

### Adjusting Limits

Edit `src/middleware/socketRateLimit.ts` to modify rate limit profiles:

```typescript
// Example: Increase chat message limit to 50/minute
chatMessage: {
  windowMs: 60000,
  maxRequests: 50, // Changed from 30
  message: 'You are sending messages too quickly. Please slow down.',
}
```

### Adding New Protected Events

1. Define a new rate limit profile in `rateLimitProfiles`
2. Add the event to the switch statement in `setupEventHandlers()`

```typescript
case 'new-event':
  return this.rateLimiter.createLimiter('new-event', rateLimitProfiles.newProfile)(socket, data, next);
```

## Monitoring

Rate limit violations are logged:

```
WARN: Rate limit exceeded for user abc123 on event chat-message. Count: 31/30
WARN: Connection rate limit exceeded for IP: 192.168.1.100
```

## Client-Side Handling

Clients should listen for rate limit events:

```javascript
socket.on('rate-limit-exceeded', ({ event, message, retryAfter }) => {
  console.warn(`Rate limited on ${event}: ${message}`);
  console.log(`Retry after ${retryAfter} seconds`);
  
  // Disable UI or show warning to user
  showRateLimitWarning(message, retryAfter);
});
```

## Testing Rate Limits

### Manual Testing

```javascript
// Test chat message rate limit
for (let i = 0; i < 35; i++) {
  socket.emit('chat-message', {
    chatSessionId: 'test-chat',
    messageId: `msg-${i}`
  });
}
// Should trigger rate limit after 30 messages
```

### Load Testing

Use tools like `socket.io-client` with multiple connections:

```javascript
const io = require('socket.io-client');

// Create 15 connections from same IP (should hit connection limit at 10)
for (let i = 0; i < 15; i++) {
  const socket = io('http://localhost:3000', {
    auth: { token: 'valid-jwt-token' }
  });
}
```

## Security Considerations

1. **IP-based limits**: Connection limits use IP addresses, which can be spoofed or shared (NAT). Consider adding user-based limits for authenticated users.

2. **Distributed systems**: Current implementation uses in-memory storage. For multi-server deployments, use Redis:
   - Install `ioredis`
   - Modify `SocketRateLimiter` to use Redis for shared state

3. **Bypass for admins**: Consider allowing admins to bypass certain limits for legitimate use cases.

4. **Dynamic limits**: Implement tiered limits based on user subscription level or reputation.

## Performance Impact

- **Memory**: ~100 bytes per active rate limit entry
- **CPU**: Negligible (<1ms per event check)
- **Cleanup**: Runs every 60 seconds to remove expired entries

## Future Enhancements

1. **Redis integration** for distributed rate limiting
2. **Tiered limits** based on user subscription
3. **Admin bypass** for privileged users
4. **Rate limit analytics** dashboard
5. **Adaptive limits** based on server load
6. **Whitelist/blacklist** for specific IPs or users
