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

### Communication
- WebRTC voice/video calls
- Real-time text messaging
- Socket.IO for instant signaling
- Typing indicators & read receipts
- Message search & history

### Management
- QR code lifecycle (create, assign, scan, revoke)
- Subscription tiers (Free, Pro, Enterprise)
- Razorpay payment integration
- Admin dashboard with analytics
- Bug reporting system
- User management

## 📊 Subscription Tiers

| Plan | Daily Calls | Daily Messages | Active Chats |
|------|-------------|----------------|--------------|
| Free | 20 | 100 | 5 |
| Pro | 80 | 500 | 20 |
| Enterprise | 200 | Unlimited | Unlimited |

## 🏗️ Architecture

```
Frontend (QR Scanner, WebRTC Client, Chat)
    ↕
Backend API (Express.js, Socket.IO, JWT Auth)
    ↕
PostgreSQL Database (Users, QR Codes, Sessions, Messages)
```

## 📚 Documentation

- **[WORKFLOW.md](WORKFLOW.md)** - Complete API workflows for admin and users
- **[API_ENDPOINTS.md](API_ENDPOINTS.md)** - All available endpoints with examples
- **[SOCKET_RATE_LIMITING.md](SOCKET_RATE_LIMITING.md)** - Socket.IO rate limiting implementation
- **[GRACEFUL_SHUTDOWN.md](GRACEFUL_SHUTDOWN.md)** - Graceful shutdown implementation
- **[PROFILE_ENDPOINT_DOCS.md](PROFILE_ENDPOINT_DOCS.md)** - Enhanced profile endpoint with usage stats
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
npm run admin:create # Create admin user (interactive)
```

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

See [WORKFLOW.md](WORKFLOW.md#6-payment--subscription-workflow) for complete payment flow.

## 🔌 WebRTC Integration

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

See [SOCKET_RATE_LIMITING.md](SOCKET_RATE_LIMITING.md) for details.

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
