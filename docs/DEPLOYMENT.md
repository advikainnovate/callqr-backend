# 🚀 Deployment

> Steps to deploy the CallQR backend to a production server.

---

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- PM2 (process manager)
- Nginx (reverse proxy)
- A domain with SSL (Let's Encrypt recommended)

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values:

```env
# Server
NODE_ENV=production
PORT=9001

# Database
DATABASE_URL=postgres://user:pass@localhost:5432/callqr

# Auth
JWT_SECRET=your_strong_secret_here
ENCRYPTION_KEY=64_char_hex_key_here

# Twilio (SMS / OTP)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Cloudinary (media uploads)
CLOUDINARY_CLOUD_NAME=your_cloud
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret

# Firebase (push notifications)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# WebRTC (optional — defaults to Google STUN)
STUN_SERVER=stun:stun.l.google.com:19302
TURN_SERVER=turn:your-turn.example.com
TURN_USERNAME=your_turn_user
TURN_PASSWORD=your_turn_password
```

---

## Deploy Steps

```bash
# 1. Pull latest code
git pull origin main

# 2. Install dependencies
npm install --production

# 3. Build TypeScript
npm run build

# 4. Apply database migrations
npm run db:migrate

# 5. Restart the process
pm2 restart callqr-backend
# or first-time start:
pm2 start dist/server.js --name callqr-backend
pm2 save
```

---

## Verify

```bash
# Check process is running
pm2 status

# Tail logs
pm2 logs callqr-backend

# Expected startup output:
# ✅ Firebase initialized successfully
# ✅ Server is running on port 9001
# ✅ Database connected

# Health check
curl https://your-domain.com/healthz
```

---

## Nginx Config (WebSocket support required)

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:9001;
        proxy_http_version 1.1;

        # Required for Socket.IO WebSocket
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

> **Important:** `proxy_read_timeout 86400` keeps WebSocket connections alive. Without this, idle sockets disconnect after 60s.

---

## Rollback

```bash
git checkout <previous-commit>
npm run build
pm2 restart callqr-backend
```

---

## Production Checklist

- [ ] All env vars set (no empty values)
- [ ] `NODE_ENV=production`
- [ ] Database migrations applied (`npm run db:migrate` recommended)
- [ ] SSL certificate active
- [ ] Nginx WebSocket config applied
- [ ] Firebase configured (push notifications)
- [ ] Twilio configured (SMS OTPs)
- [ ] Cloudinary configured (media uploads)
- [ ] PM2 process saved (`pm2 save`)
- [ ] `pm2 startup` run so process restarts on reboot
- [ ] Health check returning 200
- [ ] Log monitoring in place
