# Privacy-Preserving QR-Based Calling System

A secure, privacy-focused calling and messaging system where users can initiate WebRTC calls and chats by scanning QR codes without exposing personal information.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 12+
- npm or yarn

### Installation

```bash
# 1. Clone and install
git clone <repository-url>
cd callqr-backend
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your database and security settings

# 3. Setup database
npm run db:push
node scripts/verify-schema.js

# 4. Start server
npm run dev  # Development
npm run build && npm start  # Production
```

### Environment Variables

```env
# Server
PORT=9001
NODE_ENV=development

# Database
DATABASE_URL=postgres://user:password@localhost:5432/dbname

# Security
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
ENCRYPTION_KEY=your-32-byte-encryption-key-hex
ADMIN_USER_IDS=comma-separated-admin-user-ids

# WebRTC
STUN_SERVER=stun:stun.l.google.com:19302
TURN_SERVER=
TURN_USERNAME=
TURN_PASSWORD=

# Razorpay (Optional - for payments)
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

# Twilio (Optional - for phone verification)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Firebase (Optional - for push notifications)
# Set either FIREBASE_SERVICE_ACCOUNT (path) or individual values:
FIREBASE_SERVICE_ACCOUNT=./serviceAccountKey.json
# FIREBASE_PROJECT_ID=your-project-id
# FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
# FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# CORS
ALLOWED_ORIGINS=*
```

## 🎯 Core Features

### Privacy & Security
- Phone/email stored as SHA-256 hashes
- QR codes contain only secure tokens
- JWT authentication with rate limiting
- Socket.IO rate limiting (prevents spam/DoS)
- Graceful shutdown with client notification
- Helmet.js security headers
- Input validation with Zod
- Password reset with secure OTP verification
- Global user blocking for platform-wide access control
- Phone verification with OTP via Twilio SMS
- **Push Notifications (FCM)** for offline calls and messages
- **Anonymous Calling Support**: Allow calls from non-registered users via QR scans
- **Guest Identity & Blocking**: Privacy-safe guest IDs with IP-based blocking
- **Call Reliability**: 30-second reconnection window with automated wake-up push notifications

### Communication
- Real-time text messaging (Registered users only)
- Socket.IO for instant signaling
- Anonymous Calling (Web-based via QR scan)
- Typing indicators & read receipts
- Message search & history

### Management
- QR code lifecycle (create, assign, scan, revoke)
- **QR Token Types**: 
  - Human Token (12 chars): `QR-94NT-FN43` - For display/manual entry
  - Machine Token (64 chars): `6d89188c...` - For API calls (required for `/api/calls/initiate`)
- Subscription tiers (Free, Pro, Enterprise)
- Razorpay payment integration
- Admin dashboard with analytics
- Bug reporting system
- User management

## 📊 Subscription Tiers

| Plan | Daily Calls | Daily Messages | Active Chats |
|------|-------------|----------------|--------------|
| Free | 50 | 50 | 5 |
| Pro | 80 | 500 | 20 |
| Enterprise | 200 | Unlimited | Unlimited |
| Anonymous | 50 (Shared/IP) | Blocked | 0 |

### Subscription Management
- **Upgrade**: Instant upgrade to higher tier with payment
- **Downgrade**: Downgrade to lower tier (with usage validation)
  - System checks if current usage fits within new plan limits
  - Prevents downgrade if usage exceeds new limits
  - Immediate effect once downgraded
- **Cancel**: Cancel paid subscription (reverts to Free tier)

## 🏗️ Architecture

```
Frontend (QR Scanner, WebRTC Client, Chat)
    ↕
Backend API (Express.js, Socket.IO, JWT Auth)
    ↕
PostgreSQL Database (Users, QR Codes, Sessions, Messages)
```

## 📚 Documentation

- **[docs/AUTHENTICATION.md](docs/AUTHENTICATION.md)** - Registration, OTP verification, and login logic
- **[docs/MESSAGING.md](docs/MESSAGING.md)** - Real-time chat, media uploads, and sockets
- **[docs/CALLS_AND_WEBRTC.md](docs/CALLS_AND_WEBRTC.md)** - WebRTC signaling and call life-cycle
- **[docs/PUSH_NOTIFICATIONS.md](docs/PUSH_NOTIFICATIONS.md)** - FCM integration for offline users
- **[docs/ADMIN_AND_BLOCKING.md](docs/ADMIN_AND_BLOCKING.md)** - Global and user-level blocking
- **[docs/RATE_LIMITING.md](docs/RATE_LIMITING.md)** - Socket and API protection
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** - Production setup and Nginx config
- **[docs/API_ENDPOINTS.md](docs/API_ENDPOINTS.md)** - Reference list of all REST endpoints
- **[docs/WORKFLOW.md](docs/WORKFLOW.md)** - End-to-end integration examples
- **[Swagger Docs](http://localhost:9001/api-docs)** - Live interactive API documentation

## 🛠️ Development

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Run ESLint
npm run prettier     # Format code
npm run db:push      # Push schema to database
npm run db:backup    # Backup database
npm run db:restore   # Restore database from backup
npm run admin:create # Create admin user (interactive)
```

### Database Backup & Restore

#### Prerequisites

**Install PostgreSQL Client Tools:**

**Windows:**
1. Download PostgreSQL from: https://www.postgresql.org/download/windows/
2. Install PostgreSQL (includes `pg_dump` and `psql`)
3. Add PostgreSQL bin directory to PATH:
   - Default location: `C:\Program Files\PostgreSQL\15\bin`
   - Add to System Environment Variables > PATH
4. Restart your terminal/IDE

**macOS:**
```bash
# Via Homebrew
brew install postgresql

# Or download from: https://www.postgresql.org/download/macosx/
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt-get install postgresql-client

# CentOS/RHEL
sudo yum install postgresql
```

#### Backup Methods

**Method 1: Node.js Scripts (Cross-platform)**
```bash
# Create a backup
npm run db:backup

# Restore from a backup
npm run db:restore backup_mydb_2024-03-05_15-30-00.sql

# List available backups
ls backups/
```

**Method 2: Shell Scripts (Unix/Linux/macOS)**
```bash
# Make scripts executable
chmod +x scripts/backup.sh scripts/restore.sh

# Create backup
./scripts/backup.sh

# Restore backup
./scripts/restore.sh backup_mydb_2024-03-05_15-30-00.sql
```

**Method 3: Batch Scripts (Windows)**
```cmd
# Create backup
scripts\backup.bat

# Restore backup
scripts\restore.bat backup_mydb_2024-03-05_15-30-00.sql
```

#### Backup Features

- ✅ **Automatic timestamping** - `backup_dbname_2026-03-16_20-10-11.sql`
- ✅ **Size reporting** - Shows backup file size
- ✅ **Recent backups list** - Shows last 5 backups
- ✅ **Error handling** - Clear error messages and troubleshooting
- ✅ **Cross-platform** - Works on Windows, macOS, Linux
- ✅ **Safety checks** - Confirmation prompts for restore operations
- ✅ **Installation guidance** - Helps install required tools

Backups are stored in the `backups/` directory with timestamps.

### Create Admin User

```bash
npm run admin:create
```

Follow the prompts to create an admin user, then add the user ID to `.env`:
```env
ADMIN_USER_IDS=user-id-from-script
```

Restart the server to apply admin privileges.
npm run db:studio    # Open Drizzle Studio
npm run db:reset     # Reset database
```

### Utility Scripts

```bash
node scripts/verify-schema.js              # Verify database schema
node scripts/generate-qr-codes.js 100      # Generate 100 QR codes
node scripts/generate-test-token.js ID UN  # Generate test JWT
node scripts/check-indexes.js              # Check database indexes
```

### Project Structure

```
src/
├── controllers/     # API endpoint handlers
├── services/        # Business logic
├── models/          # Database schemas (Drizzle ORM)
├── routes/          # API routes
├── middlewares/     # Express middleware
├── schemas/         # Zod validation schemas
├── config/          # Configuration files
└── utils/           # Utility functions
```

## 💳 Razorpay Integration (Optional)

The system includes full Razorpay payment integration for subscription upgrades. If you don't configure Razorpay credentials, the app works normally with manual subscription management.

### Setup

1. Sign up at [Razorpay Dashboard](https://dashboard.razorpay.com/)
2. Get your API keys (Key ID and Key Secret)
3. Add to `.env`:
```env
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=your_secret_key
```

### Features
- Secure payment order creation
- Payment signature verification
- Automatic subscription activation
- Payment history tracking
- Webhook support for payment events
- Idempotency for duplicate payments

### Frontend Integration
```javascript
// Load Razorpay SDK
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>

// Create order and open checkout
const order = await createOrder('pro');
const options = {
  key: order.keyId,
  amount: order.amount,
  order_id: order.orderId,
  handler: (response) => verifyPayment(response)
};
new Razorpay(options).open();
```

See [docs/WORKFLOW.md](docs/WORKFLOW.md#6-payment--subscription-workflow) for complete payment flow.

## 🔌 WebRTC Integration

### Complete WebRTC Event Flow

The system supports the full WebRTC signaling flow:

```
Caller → initiate-call → Server creates call room
Server → incoming-call → Receiver  
Receiver → accept-call → Server: both join call:${callId}
Caller → webrtc-offer → Server → Receiver (via call room)
Receiver → webrtc-answer → Server → Caller (via call room)
Both → webrtc-ice-candidate → Server → Other party (via call room)
```

### Supported WebRTC Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `initiate-call` | Client → Server | Start call process |
| `incoming-call` | Server → Client | Notify receiver of incoming call |
| `accept-call` | Client → Server | Accept incoming call |
| `reject-call` | Client → Server | Reject incoming call |
| `end-call` | Client → Server | End active call |
| `webrtc-offer` | Client ↔ Server | WebRTC offer signaling |
| `webrtc-answer` | Client ↔ Server | WebRTC answer signaling |
| `webrtc-ice-candidate` | Client ↔ Server | ICE candidate exchange |
| `call-accepted` | Server → Client | Call was accepted |
| `call-rejected` | Server → Client | Call was rejected |
| `call-ended` | Server → Client | Call was ended |

### Socket.IO Rate Limiting

All Socket.IO events are protected with rate limiting to prevent abuse:

| Event Type | Limit | Window |
|------------|-------|--------|
| WebRTC Signaling | 100 requests | 1 minute |
| Call Actions | 20 requests | 1 minute |
| Chat Messages | 30 messages | 1 minute |
| Typing Indicators | 20 events | 10 seconds |
| Chat Room Actions | 30 requests | 1 minute |
| Read Receipts | 50 requests | 1 minute |
| Connections (per IP) | 10 connections | 1 minute |

See [docs/RATE_LIMITING.md](docs/RATE_LIMITING.md) for details.

### Client Setup

```javascript
const socket = io('https://api.yourdomain.com', {
  path: '/socket.io',
  transports: ['websocket'],
  auth: { token: 'JWT_TOKEN' }
});

// Handle rate limit events
socket.on('rate-limit-exceeded', ({ event, message, retryAfter }) => {
  console.warn(`Rate limited: ${message}. Retry after ${retryAfter}s`);
});
```

### Nginx Configuration

```nginx
location /socket.io/ {
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_http_version 1.1;
    proxy_pass http://localhost:9001/socket.io/;
}
```

## 📈 Database Schema

### Core Tables
- **users** - User accounts with hashed phone/email
- **qr_codes** - QR tokens with assignment tracking
- **call_sessions** - Call history and status
- **chat_sessions** - Chat conversations
- **messages** - Chat messages with read status
- **subscriptions** - User subscription plans
- **bug_reports** - Bug tracking system

### Indexes (32 total)
All tables have optimized indexes on:
- Status fields for filtering
- Foreign keys for joins
- Timestamps for sorting
- Unique constraints for data integrity

## 🚀 Deployment

### Production Checklist
1. Set `NODE_ENV=production`
2. Configure production database
3. Set strong JWT_SECRET and ENCRYPTION_KEY
4. Configure CORS with specific origins
5. Set up SSL certificates
6. Configure TURN server for WebRTC
7. Set up monitoring and logging

### PM2 Deployment

```bash
npm run build
pm2 start ecosystem.config.js
pm2 save
```

## 🆘 Troubleshooting

### Database Issues
```bash
npm run db:reset
npm run db:push
node scripts/verify-schema.js
```

### Build Errors
```bash
npm run build
# Check for TypeScript errors
```

### Socket.IO Connection Issues
- Ensure `transports: ['websocket']` in client
- Check Nginx proxy configuration
- Verify JWT token is valid

## 📄 License

ISC License

---

**Built with ❤️ for privacy-preserving communication**
