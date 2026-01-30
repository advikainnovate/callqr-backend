# Privacy-Preserving QR-Based Calling System

A secure, privacy-focused calling system where users can initiate WebRTC calls by scanning QR codes without exposing personal information like phone numbers, names, or email addresses.

## 🚀 Features

### Core Functionality
- **Privacy-Preserving**: QR codes contain only secure tokens, no personal data
- **WebRTC Calling**: In-app voice/video calls with real-time signaling
- **Secure Authentication**: JWT-based user authentication
- **QR Code Management**: Create, scan, revoke QR codes with expiration
- **Call Routing**: Automatic call setup through secure token mapping
- **Real-time Communication**: Socket.IO for instant call signaling

### Security Features
- **Rate Limiting**: Prevent abuse with intelligent rate limiting
- **Input Validation**: Comprehensive request validation with Zod
- **Token Security**: Cryptographically secure QR tokens
- **Authentication**: JWT tokens with proper expiration
- **CORS Protection**: Configurable cross-origin security
- **Security Headers**: Helmet.js for security best practices

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   PostgreSQL    │
│                 │    │                 │    │     Database     │
│ - QR Scanner    │◄──►│ - Express.js    │◄──►│                 │
│ - WebRTC Client │    │ - Socket.IO     │    │ - Users         │
│ - Auth Manager  │    │ - JWT Auth      │    │ - QR Codes      │
└─────────────────┘    │ - Rate Limiting │    │ - Calls         │
                       │ - Validation    │    └─────────────────┘
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

# Then run migrations
npm run db:push
```

### 4. Start the Server
```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

## 🧪 Testing

### Using Bruno Collection
1. Open Bruno and import the collection from the `/bruno` directory
2. Configure the environment with your server URL (`{{baseUrl}}`)
3. Run tests in sequence to test the complete flow

### Complete Testing Flow
1. **User Registration** → Create test user
2. **User Login** → Get authentication token
3. **Create QR Code** → Generate scannable QR code
4. **Scan QR Code** → Get user profile (privacy-preserving)
5. **Initiate Call** → Start WebRTC call signaling
6. **WebRTC Config** → Get STUN/TURN servers

## 📱 API Endpoints

### Authentication
- `POST /api/users/register` - Register new user
- `POST /api/users/login` - User login
- `GET /api/users/profile` - Get user profile

### QR Code Management
- `POST /api/qr-codes/create` - Create new QR code
- `POST /api/qr-codes/scan` - Scan QR code and get user profile
- `GET /api/qr-codes/my-codes` - Get user's QR codes
- `PATCH /api/qr-codes/{qrCodeId}/revoke` - Revoke QR code

### Call Management
- `POST /api/calls/initiate` - Initiate new call
- `GET /api/calls/{callId}` - Get call details
- `GET /api/calls/history` - Get call history
- `GET /api/calls/active` - Get active calls
- `PATCH /api/calls/{callId}/status` - Update call status
- `PATCH /api/calls/{callId}/end` - End call

### WebRTC Configuration
- `GET /api/webrtc/config` - Get ICE server configuration

### System
- `GET /healthz` - Health check endpoint
- `GET /api-docs` - Swagger API documentation

## 🔌 WebRTC Integration

### Get WebRTC Configuration
```bash
curl -X GET http://localhost:4000/api/webrtc/config
```

Response:
```json
{
  "success": true,
  "data": {
    "iceServers": [
      { "urls": "stun:stun.l.google.com:19302" }
    ]
  }
}
```

### Socket.IO Connection
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:4000', {
  auth: {
    token: 'YOUR_JWT_TOKEN'
  }
});
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

## 📊 Database Schema

### Users Table
- `id` (UUID) - Primary key
- `email` (TEXT) - Unique email address
- `isActive` (BOOLEAN) - Account status
- `isDeleted` (BOOLEAN) - Soft delete flag
- `createdAt` (TIMESTAMP) - Registration time
- `updatedAt` (TIMESTAMP) - Last update time

### QR Codes Table
- `id` (UUID) - Primary key
- `userId` (UUID) - Foreign key to users
- `token` (VARCHAR) - Secure unique token (64-char hex)
- `isActive` (BOOLEAN) - QR code status
- `isRevoked` (BOOLEAN) - Revocation status
- `expiresAt` (TIMESTAMP) - Optional expiration
- `lastScannedAt` (TIMESTAMP) - Last scan time
- `scanCount` (INTEGER) - Usage analytics
- `createdAt` (TIMESTAMP) - Creation time
- `updatedAt` (TIMESTAMP) - Last update time

### Calls Table
- `id` (UUID) - Primary key
- `callerId` (UUID) - Who initiated
- `receiverId` (UUID) - Who received
- `qrCodeId` (UUID) - QR code used
- `status` (VARCHAR) - Call status (initiated, connected, ended, failed)
- `callType` (VARCHAR) - webrtc
- `duration` (INTEGER) - Call duration in seconds
- `startedAt` (TIMESTAMP) - Call start time
- `endedAt` (TIMESTAMP) - Call end time
- `createdAt` (TIMESTAMP) - Creation time
- `updatedAt` (TIMESTAMP) - Last update time

## 🔒 Security Features

### Privacy Protection
- QR codes contain only secure tokens, no personal data
- Tokens are cryptographically generated (32 bytes, hex encoded)
- User information is never exposed in QR codes
- QR scan returns only non-sensitive user data (id, isActive, createdAt)

### Authentication & Authorization
- JWT-based authentication with configurable expiration
- Socket.IO connections require valid JWT tokens
- All protected endpoints validate user authentication
- Rate limiting prevents brute force attacks

### Input Validation & Security
- All inputs validated with Zod schemas
- SQL injection protection via Drizzle ORM
- XSS protection headers via Helmet.js
- CORS configuration for cross-origin security
- Request body sanitization

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
```

### Project Structure
```
src/
├── controllers/     # API endpoint handlers
├── services/        # Business logic
├── models/          # Database schemas
├── routes/          # API routes
├── middleware/      # Express middleware
├── schemas/         # Zod validation schemas
├── config/          # Configuration files
├── utils/           # Utility functions
└── types/           # TypeScript type definitions
```

## 📄 License

This project is licensed under the ISC License.

---

**Built with ❤️ for privacy-preserving communication**
