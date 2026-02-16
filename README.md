# Privacy-Preserving QR-Based Calling System

A secure, privacy-focused calling system where users can initiate WebRTC calls by scanning QR codes without exposing personal information.

## 📖 Documentation

- **[Frontend Integration Guide](FRONTEND_README.md)** - Complete guide for connecting your frontend 📱
- **[API Documentation](http://localhost:4000/api-docs)** - Live Swagger docs 🔍

## 🚀 Features

### Core Functionality
- **Privacy-Preserving**: Phone/email are hashed, QR codes contain only secure tokens
- **WebRTC Calling**: In-app voice/video calls with real-time signaling
- **Real-time Chat**: Text messaging with typing indicators and read receipts
- **Secure Authentication**: JWT-based user authentication
- **QR Code Lifecycle**: Create, assign, scan, revoke, disable, or reactivate QR codes
- **Call & Chat Session Management**: Detailed status tracking with reason codes
- **Real-time Communication**: Socket.IO for instant signaling and messaging
- **Subscription Management**: Three tiers with daily limits (Free, Pro, Enterprise)
- **Bug Reporting**: Submit and track bug reports (anonymous supported)

### Security Features
- **Rate Limiting**: Prevent abuse with intelligent rate limiting
- **Input Validation**: Comprehensive request validation with Zod
- **Token Security**: Cryptographically secure QR tokens (64-char hex)
- **Authentication**: JWT tokens with proper expiration
- **CORS Protection**: Configurable cross-origin security
- **Security Headers**: Helmet.js for security best practices
- **Data Privacy**: Phone and email stored as SHA-256 hashes

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   PostgreSQL    │
│                 │    │                 │    │     Database     │
│ - QR Scanner    │◄──►│ - Express.js    │◄──►│                 │
│ - WebRTC Client │    │ - Socket.IO     │    │ - Users         │
│ - Chat Client   │    │ - JWT Auth      │    │ - QR Codes      │
│ - Auth Manager  │    │ - Rate Limiting │    │ - Call Sessions │
└─────────────────┘    │ - Validation    │    │ - Chat Sessions │
                       └─────────────────┘    │ - Messages      │
                                              │ - Subscriptions │
                                              │ - Bug Reports   │
                                              └─────────────────┘
```

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL 12+
- npm or yarn

## 🛠️ Installation

### 1. Clone and Setup
```bash
git clone <repository-url>
cd express_typescript_postgres_template
npm install
```

### 2. Environment Configuration
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Server Configuration
PORT=4000
NODE_ENV=development

# Database Configuration
DATABASE_URL=postgres://username:password@localhost:5432/qr_calling_db

# Security
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
ENCRYPTION_KEY=your-32-byte-encryption-key-hex-encoded

# CORS Configuration
ALLOWED_ORIGINS=*

# WebRTC Configuration
STUN_SERVER=stun:stun.l.google.com:19302
TURN_SERVER=
TURN_USERNAME=
TURN_PASSWORD=

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 3. Database Setup
```bash
# Setup database (creates if doesn't exist)
node scripts/setup-database.js

# Push schema to database
npm run db:push

# Verify schema
node scripts/verify-schema.js
```

### 4. Start the Server
```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

### 5. Multi-Process Deployment (PM2)
In production environments (like a PM2 cluster), Socket.IO **must** be configured to use `websocket` transport exclusively to avoid session ID mismatches across different worker processes.

```env
# Ensure this is set and client uses:
transports: ['websocket']
```

## 🧪 Testing

### Using Bruno Collection
1. Open [Bruno](https://usebruno.com) and import the collection from the `/bruno` directory
2. Configure the environment with your server URL (`{{baseUrl}}`)
3. Run tests in sequence to test the complete flow

### Complete Testing Flow
1. **Register** → Create test user
2. **Generate Token** → Create JWT token manually (see below)
3. **Create QR** → Generate unassigned QR code
4. **Assign QR** → Assign QR code to user
5. **Scan QR** → Get privacy-preserving profile
6. **Create Subscription** → Set up user subscription
7. **Initiate Call** → Start WebRTC signaling
8. **Initiate Chat** → Start chat session via QR scan
9. **Send Messages** → Exchange messages with typing indicators
10. **Get Config** → Fetch STUN/TURN servers

### Chat Feature Workflow
After scanning a QR code, users can choose to either call or chat:

1. **Scan QR Code** → `POST /api/qr-codes/scan` with token
2. **Choose Action**:
   - **Call**: `POST /api/calls/initiate` → WebRTC signaling
   - **Chat**: `POST /api/chat-sessions/initiate` → Start chat
3. **Chat Flow**:
   - Join chat room via Socket.IO: `socket.emit('join-chat', { chatSessionId })`
   - Send messages: `POST /api/messages/send` → `socket.emit('chat-message')`
   - Receive messages: `socket.on('new-message')`
   - Typing indicators: `socket.emit('typing-start')` / `socket.emit('typing-stop')`
   - Mark as read: `PATCH /api/messages/:messageId/read` → `socket.emit('message-read')`
   - End chat: `PATCH /api/chat-sessions/:chatSessionId/end`

### Generate JWT Token for Testing
Since the new schema doesn't use passwords, generate tokens manually:

```bash
# After registering a user, generate a token
node scripts/generate-test-token.js USER_ID USERNAME

# Example
node scripts/generate-test-token.js 123e4567-e89b-12d3-a456-426614174000 testuser
```

Copy the generated token and use it in your API requests.

## 📱 API Endpoints

### Authentication & Users
- `POST /api/users/register` - Register new account
- `GET /api/users/profile` - Get current user profile
- `GET /api/users/:userId` - Get user by ID
- `PATCH /api/users/:userId` - Update user
- `PATCH /api/users/:userId/block` - Block user (admin)
- `DELETE /api/users/:userId` - Delete user (soft delete)
- `PATCH /api/users/:userId/activate` - Activate user
- `POST /api/users/verify/phone` - Verify phone exists
- `POST /api/users/verify/email` - Verify email exists

### QR Code Management
- `POST /api/qr-codes/create` - Generate a new unassigned QR code (admin)
- `POST /api/qr-codes/bulk-create` - Bulk generate QR codes (admin, 1-1000)
- `POST /api/qr-codes/claim` - Claim an unassigned QR code (user)
- `POST /api/qr-codes/:qrCodeId/assign` - Assign QR code to user (admin)
- `POST /api/qr-codes/scan` - Scan QR code and get user info
- `GET /api/qr-codes/my-codes` - List all your QR codes
- `GET /api/qr-codes/unassigned` - List unassigned QR codes (admin)
- `GET /api/qr-codes/image/:token` - Get QR code image (PNG)
- `PATCH /api/qr-codes/:qrCodeId/revoke` - Revoke QR code
- `PATCH /api/qr-codes/:qrCodeId/disable` - Disable QR code
- `PATCH /api/qr-codes/:qrCodeId/reactivate` - Reactivate QR code

### Call Session Management
- `POST /api/calls/initiate` - Start a call session
- `GET /api/calls/:callId` - View call session details
- `PATCH /api/calls/:callId/accept` - Accept incoming call
- `PATCH /api/calls/:callId/reject` - Reject incoming call
- `PATCH /api/calls/:callId/status` - Update call status
- `PATCH /api/calls/:callId/end` - Terminate call
- `GET /api/calls/history/all` - Get call history
- `GET /api/calls/active/list` - Get currently active calls
- `GET /api/calls/usage/stats` - Get daily call usage

### Subscription Management
- `POST /api/subscriptions` - Create subscription (admin)
- `GET /api/subscriptions/active` - Get active subscription
- `GET /api/subscriptions/history` - Get subscription history
- `GET /api/subscriptions/plan` - Get current plan
- `GET /api/subscriptions/usage` - Get call usage stats
- `POST /api/subscriptions/upgrade` - Upgrade subscription plan
- `DELETE /api/subscriptions/:subscriptionId` - Cancel subscription

### Bug Reports
- `POST /api/reports` - Submit a bug report (anonymous OK)
- `GET /api/reports/:reportId` - Get bug report details
- `GET /api/reports/my/all` - List my bug reports
- `GET /api/reports/admin/all` - List all bug reports (admin)
- `PATCH /api/reports/:reportId/status` - Update report status (admin)
- `PATCH /api/reports/:reportId/severity` - Update severity (admin)
- `GET /api/reports/severity/:severity` - Get reports by severity (admin)
- `GET /api/reports/status/:status` - Get reports by status (admin)

### Chat Management
- `POST /api/chat-sessions/initiate` - Start a chat session via QR scan
- `GET /api/chat-sessions/:chatSessionId` - Get chat session details
- `GET /api/chat-sessions/my-chats` - List all your chat sessions
- `GET /api/chat-sessions/active` - List active chat sessions
- `PATCH /api/chat-sessions/:chatSessionId/end` - End chat session
- `PATCH /api/chat-sessions/:chatSessionId/block` - Block chat session

### Message Management
- `POST /api/messages/send` - Send a message in chat
- `GET /api/messages/:chatSessionId` - Get messages in chat (paginated)
- `PATCH /api/messages/:messageId/read` - Mark message as read
- `PATCH /api/messages/:chatSessionId/read-all` - Mark all messages as read
- `DELETE /api/messages/:messageId` - Delete your message
- `GET /api/messages/unread-count` - Get total unread message count
- `GET /api/messages/:chatSessionId/search` - Search messages in chat

### Admin Dashboard
- `GET /api/admin/overview` - Get dashboard overview stats
- `GET /api/admin/users` - Get all users (with filters)
- `GET /api/admin/users/:userId` - Get user details
- `PATCH /api/admin/users/:userId/block` - Block user
- `PATCH /api/admin/users/:userId/unblock` - Unblock user
- `DELETE /api/admin/users/:userId` - Delete user
- `GET /api/admin/qr-codes` - Get all QR codes (with filters)
- `GET /api/admin/qr-codes/:qrCodeId` - Get QR code details
- `POST /api/admin/qr-codes/bulk-create` - Bulk create QR codes
- `POST /api/admin/qr-codes/:qrCodeId/assign` - Assign QR to user
- `PATCH /api/admin/qr-codes/:qrCodeId/revoke` - Revoke QR code
- `GET /api/admin/calls` - Get call history (with filters)
- `GET /api/admin/calls/:callId` - Get call details
- `GET /api/admin/chats` - Get chat history (with filters)
- `GET /api/admin/chats/:chatId` - Get chat details

### WebRTC Configuration
- `GET /api/webrtc/config` - Fetches dynamic ICE (STUN/TURN) servers

### System
- `GET /healthz` - Load balancer health check
- `GET /api-docs` - Live Swagger documentation

## 🔌 WebRTC Integration

### Connection Strategy (Production)
For maximum stability behind Nginx/Load Balancers:
1. **Force WebSockets**: Skip polling to avoid 400/502 errors.
2. **Path Matching**: If deployed on a subpath (e.g., `/callqr-backend/`), ensure the Socket.IO `path` matches exactly.

### Client Initialization
```javascript
const socket = io('https://api.yourdomain.com', {
  path: '/callqr-backend/socket.io', // Match your deployment subpath
  transports: ['websocket'],        // REQUIRED for stability
  upgrade: false,                   // Prevent transport fallback
  auth: { token: 'JWT_TOKEN' }
});
```

### Nginx Configuration
Ensure your Nginx proxy includes headers to allow WebSocket upgrades:
```nginx
location /callqr-backend/socket.io/ {
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_http_version 1.1;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Host $host;
    proxy_pass http://localhost:9001/callqr-backend/socket.io/;
}
```

### WebRTC Events
```javascript
// Listen for incoming calls
socket.on('incoming-call', (data) => {
  console.log('Incoming call:', data.callId, data.callerId, data.callType);
});

// Send WebRTC offer
socket.emit('webrtc-signal', {
  type: 'offer',
  callId: 'CALL_ID',
  targetUserId: 'RECEIVER_ID',
  data: rtcOffer
});

// Accept call
socket.emit('accept-call', { callId: 'CALL_ID' });

// Reject call
socket.emit('reject-call', { callId: 'CALL_ID' });

// End call
socket.emit('end-call', { callId: 'CALL_ID' });
```

### Chat Events
```javascript
// Join chat room
socket.emit('join-chat', { chatSessionId: 'CHAT_ID' });

// Send message (after creating via API)
socket.emit('chat-message', { 
  chatSessionId: 'CHAT_ID', 
  messageId: 'MESSAGE_ID' 
});

// Typing indicators
socket.emit('typing-start', { chatSessionId: 'CHAT_ID' });
socket.emit('typing-stop', { chatSessionId: 'CHAT_ID' });

// Mark message as read
socket.emit('message-read', { 
  chatSessionId: 'CHAT_ID', 
  messageId: 'MESSAGE_ID' 
});

// Leave chat room
socket.emit('leave-chat', { chatSessionId: 'CHAT_ID' });

// Listen for new messages
socket.on('new-message', (data) => {
  console.log('New message:', data.messageId, data.senderId);
});

// Listen for typing indicators
socket.on('user-typing', (data) => {
  console.log('User typing:', data.userId);
});

socket.on('user-stopped-typing', (data) => {
  console.log('User stopped typing:', data.userId);
});

// Listen for read receipts
socket.on('message-read', (data) => {
  console.log('Message read:', data.messageId, data.readBy);
});

// Listen for message delivery confirmation
socket.on('message-delivered', (data) => {
  console.log('Message delivered:', data.messageId);
});
```

## 📊 Database Schema

### Users Table
```sql
- id (uuid, pk)
- username (text, unique)
- phone_hash (text, nullable) -- SHA-256 hash
- email_hash (text, nullable) -- SHA-256 hash
- status (varchar) -- active, blocked, deleted
- created_at (timestamp)
- updated_at (timestamp)
```

### QR Codes Table
```sql
- id (uuid, pk)
- token (varchar, unique, indexed) -- 64-char hex for QR image
- human_token (varchar, unique, indexed) -- Human-readable (e.g., QR-K9F7-M2QX)
- assigned_user_id (uuid, fk → users.id, nullable)
- status (varchar) -- unassigned, active, disabled, revoked
- created_at (timestamp)
- assigned_at (timestamp, nullable)
```

### Call Sessions Table
```sql
- id (uuid, pk)
- caller_id (uuid, fk → users.id)
- receiver_id (uuid, fk → users.id)
- qr_id (uuid, fk → qr_codes.id)
- status (varchar) -- initiated, ringing, connected, ended, failed
- ended_reason (varchar, nullable) -- busy, rejected, timeout, error
- started_at (timestamp)
- ended_at (timestamp, nullable)
```

### Subscriptions Table
```sql
- id (uuid, pk)
- user_id (uuid, fk → users.id)
- plan (varchar) -- free, pro, enterprise
- status (varchar) -- active, expired, canceled
- started_at (timestamp)
- expires_at (timestamp, nullable)
- created_at (timestamp)
```

### Bug Reports Table
```sql
- id (uuid, pk)
- user_id (uuid, fk → users.id, nullable) -- Allows anonymous reports
- description (text)
- severity (varchar) -- low, medium, high, critical
- status (varchar) -- open, in_progress, resolved
- created_at (timestamp)
```

### Chat Sessions Table
```sql
- id (uuid, pk)
- participant1_id (uuid, fk → users.id)
- participant2_id (uuid, fk → users.id)
- qr_id (uuid, fk → qr_codes.id)
- status (varchar) -- active, ended, blocked
- started_at (timestamp)
- ended_at (timestamp, nullable)
- last_message_at (timestamp, nullable)
- created_at (timestamp)
```

### Messages Table
```sql
- id (uuid, pk)
- chat_session_id (uuid, fk → chat_sessions.id)
- sender_id (uuid, fk → users.id)
- message_type (varchar) -- text, image, file, system
- content (text)
- is_read (boolean)
- is_deleted (boolean)
- sent_at (timestamp)
- read_at (timestamp, nullable)
```

## 🔒 Security Features

### Privacy Protection
- Phone and email are hashed using SHA-256 (not stored in plain text)
- QR codes contain only secure tokens, no personal data
- Tokens are cryptographically generated (32 bytes, hex encoded)
- User information is never exposed in QR codes
- QR scan returns only non-sensitive user data (id, username, status)

### Authentication & Authorization
- JWT-based authentication with configurable expiration
- Socket.IO connections require valid JWT tokens
- All protected endpoints validate user authentication
- Rate limiting prevents brute force attacks
- User status management (active, blocked, deleted)

### Input Validation & Security
- All inputs validated with Zod schemas
- SQL injection protection via Drizzle ORM
- XSS protection headers via Helmet.js
- CORS configuration for cross-origin security
- Request body sanitization

## 📈 Subscription Tiers

| Tier | Daily Call Limit | Daily Message Limit | Active Chats | Features |
|------|-----------------|---------------------|--------------|----------|
| Free | 20 calls/day | 100 messages/day | 5 active | Basic features |
| Pro | 80 calls/day | 500 messages/day | 20 active | Enhanced features |
| Enterprise | 200 calls/day | Unlimited | Unlimited | Full features |

Subscription management includes:
- Plan upgrades/downgrades
- Subscription history tracking
- Automatic expiration handling
- Usage statistics and monitoring
- Call and message limit enforcement

## 🚀 Deployment

### Environment Setup
1. Set production environment variables
2. Configure PostgreSQL database
3. Set up reverse proxy (nginx/Apache)
4. Configure SSL certificates
5. Set up monitoring and logging

### Production Environment Variables
```env
NODE_ENV=production
DATABASE_URL=postgres://user:pass@host:5432/dbname
JWT_SECRET=production-secret-key-64-chars
ENCRYPTION_KEY=production-encryption-key-64-hex-chars
ALLOWED_ORIGINS=https://yourdomain.com
STUN_SERVER=stun:stun.l.google.com:19302
TURN_SERVER=turn:your-turn-server.com:3478
TURN_USERNAME=turn-user
TURN_PASSWORD=turn-password
```

## 📈 Monitoring

### Health Check
```bash
curl http://localhost:4000/healthz
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-01-29T20:00:00.000Z",
  "uptime": 3600,
  "environment": "development"
}
```

### API Documentation
Visit `http://localhost:4000/api-docs` for complete Swagger documentation including:
- All REST API endpoints
- Socket.IO event documentation
- Request/response schemas
- Authentication requirements

## 🛠️ Development

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm run test         # Run tests
npm run lint         # Run ESLint
npm run prettier     # Format code
npm run db:generate  # Generate database migrations
npm run db:migrate   # Run database migrations
npm run db:push      # Push schema to database
npm run db:studio    # Open Drizzle Studio
npm run db:reset     # Reset database (drops all tables)
```

### Utility Scripts
```bash
# Verify database schema
node scripts/verify-schema.js

# Generate JWT token for testing
node scripts/generate-test-token.js USER_ID USERNAME

# Bulk generate QR codes (1-1000)
node scripts/generate-qr-codes.js 100

# Setup database
node scripts/setup-database.js
```

### Project Structure
```
src/
├── controllers/     # API endpoint handlers
├── services/        # Business logic
│   ├── user.service.ts
│   ├── qrCode.service.ts
│   ├── callSession.service.ts
│   ├── chatSession.service.ts
│   ├── message.service.ts
│   ├── subscription.service.ts
│   ├── bugReport.service.ts
│   └── webrtc.service.ts
├── models/          # Database schemas (Drizzle)
│   ├── user.schema.ts
│   ├── qrCode.schema.ts
│   ├── call.schema.ts
│   ├── chatSession.schema.ts
│   ├── message.schema.ts
│   ├── subscription.schema.ts
│   └── report.schema.ts
├── routes/          # API routes
├── middlewares/     # Express middleware
├── schemas/         # Zod validation schemas
├── config/          # Configuration files
├── utils/           # Utility functions
└── types/           # TypeScript type definitions
```

## 🆘 Troubleshooting

### Server won't start
```bash
# Check database connection
node scripts/verify-schema.js

# Check for TypeScript errors
npm run build
```

### Database errors
```bash
# Reset and recreate database
npm run db:reset
npm run db:push
```

### JWT errors
```bash
# Generate a new test token
node scripts/generate-test-token.js USER_ID USERNAME
```

## 📄 License

This project is licensed under the ISC License.

---

**Built with ❤️ for privacy-preserving communication**
