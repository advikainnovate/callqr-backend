# Socket.IO Rate Limiting Flow Diagram

## Connection Flow

```
┌─────────────────┐
│  Client Tries  │
│  to Connect    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Connection Rate Limiter        │
│  (IP-based)                     │
│  • Check: 10 conn/min per IP    │
└────────┬────────────────────────┘
         │
    ┌────┴────┐
    │ Allowed? │
    └────┬────┘
         │
    ┌────┴────────────────┐
    │                     │
   YES                   NO
    │                     │
    ▼                     ▼
┌─────────────┐    ┌──────────────────┐
│ JWT Auth    │    │ Reject Connection│
│ Middleware  │    │ "Too many conn"  │
└──────┬──────┘    └──────────────────┘
       │
  ┌────┴────┐
  │ Valid?  │
  └────┬────┘
       │
  ┌────┴──────────┐
  │               │
 YES             NO
  │               │
  ▼               ▼
┌──────────┐  ┌─────────────┐
│Connected │  │   Reject    │
│          │  │"Auth failed"│
└──────────┘  └─────────────┘
```

## Event Flow (After Connection)

```
┌──────────────────┐
│ Client Emits     │
│ Event            │
│ (e.g., message)  │
└────────┬─────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  socket.use() Middleware            │
│  • Identify event type              │
│  • Select rate limit profile        │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  SocketRateLimiter                  │
│  • Check user's event count         │
│  • Compare against limit            │
└────────┬────────────────────────────┘
         │
    ┌────┴────┐
    │ Within  │
    │ Limit?  │
    └────┬────┘
         │
    ┌────┴──────────────┐
    │                   │
   YES                 NO
    │                   │
    ▼                   ▼
┌─────────────┐   ┌──────────────────────┐
│ Increment   │   │ Emit rate-limit-     │
│ Counter     │   │ exceeded event       │
└──────┬──────┘   │ • event name         │
       │          │ • message            │
       │          │ • retryAfter         │
       │          └──────────────────────┘
       │                   │
       ▼                   ▼
┌─────────────┐   ┌──────────────────────┐
│ Execute     │   │ Block Event          │
│ Event       │   │ (call next(error))   │
│ Handler     │   └──────────────────────┘
└─────────────┘
```

## Rate Limit Storage Structure

```
┌─────────────────────────────────────────────┐
│  SocketRateLimiter.limits                   │
│  Map<eventName, Map<userKey, entry>>        │
└─────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
┌──────────────────┐   ┌──────────────────┐
│ Event: "message" │   │ Event: "signal"  │
│ Map<key, entry>  │   │ Map<key, entry>  │
└────────┬─────────┘   └────────┬─────────┘
         │                      │
    ┌────┴────┐            ┌────┴────┐
    │         │            │         │
    ▼         ▼            ▼         ▼
┌────────┐ ┌────────┐  ┌────────┐ ┌────────┐
│user1:  │ │user2:  │  │user1:  │ │user3:  │
│message │ │message │  │signal  │ │signal  │
│        │ │        │  │        │ │        │
│count: 5│ │count:15│  │count:42│ │count: 8│
│reset:  │ │reset:  │  │reset:  │ │reset:  │
│1234567 │ │1234890 │  │1234678 │ │1234901 │
└────────┘ └────────┘  └────────┘ └────────┘
```

## Rate Limit Profiles

```
┌─────────────────────────────────────────────────┐
│              Rate Limit Profiles                │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ WebRTC Signaling                        │   │
│  │ • 100 requests / 60 seconds             │   │
│  │ • Allows: offers, answers, ICE          │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ Call Actions                            │   │
│  │ • 20 requests / 60 seconds              │   │
│  │ • Applies to: initiate, accept, reject  │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ Chat Messages                           │   │
│  │ • 30 messages / 60 seconds              │   │
│  │ • Prevents message flooding             │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ Typing Indicators                       │   │
│  │ • 20 events / 10 seconds                │   │
│  │ • Short window for rapid events         │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ Chat Room Actions                       │   │
│  │ • 30 requests / 60 seconds              │   │
│  │ • Join/leave operations                 │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ Read Receipts                           │   │
│  │ • 50 requests / 60 seconds              │   │
│  │ • Higher limit for normal usage         │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Client-Side Integration

```
┌──────────────────────────────────────────────┐
│           Client Application                 │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│      RateLimitAwareSocketClient              │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │ Listen: rate-limit-exceeded            │ │
│  │ • Store event in rateLimitedEvents     │ │
│  │ • Show notification to user            │ │
│  │ • Auto-clear after retryAfter          │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │ safeEmit(event, data)                  │ │
│  │ • Check if event is rate limited       │ │
│  │ • Block if limited, emit if allowed    │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │ Client-Side Throttling                 │ │
│  │ • Typing: max 1 event per 2 seconds    │ │
│  │ • Prevents hitting server limits       │ │
│  └────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

## Attack Prevention

```
┌─────────────────────────────────────────────┐
│         Attack Scenarios (BEFORE)           │
├─────────────────────────────────────────────┤
│                                             │
│  ❌ Spam 1000 messages/second               │
│  ❌ Flood signaling with fake offers        │
│  ❌ Exhaust connections (100+ per second)   │
│  ❌ DoS with typing indicator spam          │
│  ❌ Overwhelm server resources              │
│                                             │
└─────────────────────────────────────────────┘
                    │
                    │ Rate Limiting Applied
                    ▼
┌─────────────────────────────────────────────┐
│         Protection (AFTER)                  │
├─────────────────────────────────────────────┤
│                                             │
│  ✅ Max 30 messages/minute                  │
│  ✅ Max 100 signals/minute                  │
│  ✅ Max 10 connections/minute per IP        │
│  ✅ Max 20 typing events/10 seconds         │
│  ✅ Server resources protected              │
│  ✅ Legitimate users unaffected             │
│                                             │
└─────────────────────────────────────────────┘
```

## Cleanup Process

```
┌─────────────────────────────────────────────┐
│  Every 60 seconds                           │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│  SocketRateLimiter.cleanup()                │
│  • Iterate through all events               │
│  • Check each entry's resetTime             │
│  • Delete if expired (now > resetTime)      │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│  Memory freed                               │
│  • Expired entries removed                  │
│  • Only active limits remain                │
│  • Prevents memory leaks                    │
└─────────────────────────────────────────────┘
```

## Monitoring & Logging

```
┌─────────────────────────────────────────────┐
│  Rate Limit Event                           │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│  Logger.warn()                              │
│  "Rate limit exceeded for user X on event Y"│
│  "Count: 31/30"                             │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│  Log Aggregation (Future)                   │
│  • Count violations per user                │
│  • Identify abuse patterns                  │
│  • Alert on excessive violations            │
│  • Dashboard visualization                  │
└─────────────────────────────────────────────┘
```
