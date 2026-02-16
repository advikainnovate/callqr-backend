# Deployment Guide

## Production Deployment Checklist

### 1. Environment Configuration

Ensure all environment variables are properly set:

```bash
# Generate secure secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Required environment variables:
- `JWT_SECRET` - Must be at least 32 characters
- `ENCRYPTION_KEY` - Must be exactly 64 hex characters (32 bytes)
- `ADMIN_USER_IDS` - Comma-separated list of admin user UUIDs
- `DATABASE_URL` - PostgreSQL connection string
- `NODE_ENV=production`

### 2. Database Setup

```bash
# Push schema to database
npm run db:push

# Verify schema
node scripts/verify-schema.js
```

### 3. Load Balancing & Sticky Sessions

When deploying behind a load balancer or using PM2 cluster mode, Socket.IO requires sticky sessions to ensure WebSocket connections are routed to the same server instance.

#### PM2 Cluster Mode

**Option 1: Use PM2 with Sticky Sessions (Recommended)**

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'callqr-backend',
    script: './dist/server.js',
    instances: 4, // or 'max' for all CPU cores
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 4000
    }
  }]
};
```

**Important**: When using PM2 cluster mode, configure Socket.IO to use WebSocket transport only:

```typescript
// Already configured in src/services/webrtc.service.ts
transports: ['websocket']
```

**Client Configuration**:
```javascript
const socket = io('https://api.yourdomain.com', {
  transports: ['websocket'],
  upgrade: false
});
```

#### Nginx Load Balancer

Configure sticky sessions using IP hash:

```nginx
upstream backend {
    ip_hash;  # Sticky sessions based on client IP
    server 127.0.0.1:4000;
    server 127.0.0.1:4001;
    server 127.0.0.1:4002;
    server 127.0.0.1:4003;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    # SSL configuration
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts for long-lived connections
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # API routes
    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### HAProxy Load Balancer

```haproxy
frontend http_front
    bind *:80
    bind *:443 ssl crt /path/to/cert.pem
    default_backend http_back

backend http_back
    balance source  # Sticky sessions based on source IP
    hash-type consistent
    
    # Health check
    option httpchk GET /healthz
    
    server server1 127.0.0.1:4000 check
    server server2 127.0.0.1:4001 check
    server server3 127.0.0.1:4002 check
    server server4 127.0.0.1:4003 check
```

### 4. Docker Deployment

```dockerfile
# Dockerfile is already provided
docker build -t callqr-backend .
docker run -d \
  --name callqr-backend \
  -p 4000:4000 \
  --env-file .env \
  callqr-backend
```

With Docker Compose:

```yaml
# docker-compose.yml is already provided
docker-compose up -d
```

### 5. Security Hardening

1. **Enable HTTPS**: Always use SSL/TLS in production
2. **Firewall Rules**: Restrict database access to application servers only
3. **Rate Limiting**: Already configured in the application
4. **CORS**: Set `ALLOWED_ORIGINS` to specific domains (not `*`)
5. **Admin Access**: Ensure `ADMIN_USER_IDS` is properly configured
6. **Audit Logs**: Monitor audit logs for security events

### 6. Monitoring & Health Checks

Health check endpoint:
```bash
curl https://api.yourdomain.com/healthz
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-16T10:00:00.000Z",
  "uptime": 3600,
  "environment": "production",
  "services": {
    "database": { "status": "connected" },
    "webrtc": { "status": "running" }
  }
}
```

### 7. Logging

Application logs are written to:
- `logs/combined.log` - All logs
- `logs/error.log` - Error logs only
- Console output (stdout/stderr)

Audit logs are stored in the database (`audit_logs` table).

### 8. Backup Strategy

1. **Database Backups**: Schedule regular PostgreSQL backups
2. **Audit Logs**: Archive audit logs periodically
3. **Configuration**: Keep `.env` files in secure backup

### 9. Graceful Shutdown

The application handles graceful shutdown on SIGTERM/SIGINT:
- Stops accepting new connections
- Closes active Socket.IO connections
- Closes database connections
- 10-second timeout before force shutdown

### 10. Performance Tuning

**Database Connection Pooling**:
Already configured in `src/db/index.ts` with `prepare: false` for transaction pool mode.

**Socket.IO Optimization**:
- WebSocket-only transport (no polling fallback)
- Per-message deflate disabled for better performance

**Node.js Settings**:
```bash
# Increase memory limit if needed
NODE_OPTIONS="--max-old-space-size=4096"
```

## Troubleshooting

### Socket.IO Connection Issues

1. **400 Bad Request**: Ensure `transports: ['websocket']` on both client and server
2. **Session Mismatch**: Enable sticky sessions in load balancer
3. **CORS Errors**: Check `ALLOWED_ORIGINS` configuration

### Database Connection Issues

1. Check `DATABASE_URL` format
2. Verify PostgreSQL is running and accessible
3. Check firewall rules

### Authentication Issues

1. Verify `JWT_SECRET` is at least 32 characters
2. Check token expiration settings
3. Review audit logs for failed login attempts

## Support

For issues and questions, check:
- Application logs in `logs/` directory
- Audit logs in database
- Health check endpoint `/healthz`
