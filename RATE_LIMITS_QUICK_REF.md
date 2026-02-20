# Socket.IO Rate Limits - Quick Reference

## 🚦 Current Limits

### WebRTC Events
```
webrtc-signal:     100 requests / 1 minute
initiate-call:      20 requests / 1 minute
accept-call:        20 requests / 1 minute
reject-call:        20 requests / 1 minute
end-call:           20 requests / 1 minute
```

### Chat Events
```
chat-message:       30 messages / 1 minute
join-chat:          30 requests / 1 minute
leave-chat:         30 requests / 1 minute
typing-start:       20 requests / 10 seconds
typing-stop:        20 requests / 10 seconds
message-read:       50 requests / 1 minute
```

### Connection Limits
```
Connections:        10 per IP / 1 minute
```

## 🔧 Adjusting Limits

Edit `src/middleware/socketRateLimit.ts`:

```typescript
export const rateLimitProfiles = {
  signaling: {
    windowMs: 60000,      // Time window (ms)
    maxRequests: 100,     // Max requests in window
    message: 'Custom error message',
  },
  // ... other profiles
};
```

## 📊 Monitoring

Rate limit violations are logged:
```
WARN: Rate limit exceeded for user abc123 on event chat-message. Count: 31/30
```

## 🎯 Client Handling

```javascript
socket.on('rate-limit-exceeded', ({ event, message, retryAfter }) => {
  // Disable UI temporarily
  disableFeature(event, retryAfter);
  
  // Show user notification
  showNotification(message);
  
  // Re-enable after retry period
  setTimeout(() => enableFeature(event), retryAfter * 1000);
});
```

## 🧪 Testing

```bash
# Run rate limit tests
npm test -- socketRateLimit.test.ts

# Manual testing with client
node examples/socket-rate-limit-client.js
```

## 🚨 Common Issues

### "Rate limit exceeded" on legitimate use
- **Solution**: Increase limit for that event type
- **Location**: `src/middleware/socketRateLimit.ts`

### Users hitting connection limit
- **Cause**: Multiple tabs/devices or NAT
- **Solution**: Increase connection limit or implement user-based tracking

### Rate limits not working
- **Check**: Ensure `WebRTCService` is initialized with rate limiters
- **Verify**: Check logs for rate limit middleware errors

## 📈 Recommended Limits by Use Case

### High-Traffic Application
```typescript
chatMessage: { windowMs: 60000, maxRequests: 50 }
signaling: { windowMs: 60000, maxRequests: 150 }
```

### Enterprise (Trusted Users)
```typescript
chatMessage: { windowMs: 60000, maxRequests: 100 }
callAction: { windowMs: 60000, maxRequests: 50 }
```

### Public/Untrusted
```typescript
chatMessage: { windowMs: 60000, maxRequests: 20 }
callAction: { windowMs: 60000, maxRequests: 10 }
```

## 🔐 Security Notes

1. **IP-based limits** can be bypassed with proxies
2. **User-based limits** are more secure but require authentication
3. **Consider Redis** for distributed deployments
4. **Monitor logs** for abuse patterns
5. **Implement progressive penalties** for repeat offenders

## 📞 Support

For issues or questions:
1. Check [SOCKET_RATE_LIMITING.md](SOCKET_RATE_LIMITING.md) for detailed docs
2. Review logs for specific error messages
3. Test with [examples/socket-rate-limit-client.js](examples/socket-rate-limit-client.js)
