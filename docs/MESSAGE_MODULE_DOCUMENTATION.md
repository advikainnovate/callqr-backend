# Message Module Documentation

## Overview

The Message Module is a comprehensive real-time messaging system that supports text messages, image uploads, and media attachments. It provides secure, scalable messaging functionality with subscription-based rate limiting, read receipts, message search, and Cloudinary-powered media storage.

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Controllers   │    │    Services     │    │   Data Layer    │
│                 │    │                 │    │                 │
│ • Send Message  │───▶│ • Message Svc   │───▶│ • Messages DB   │
│ • Get Messages  │    │ • Media Svc     │    │ • Chat Sessions │
│ • Mark as Read  │    │ • Subscription  │    │ • Users         │
│ • Search        │    │ • Chat Session  │    │ • Subscriptions │
│ • Delete        │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   External      │
                       │                 │
                       │ • Cloudinary    │
                       │ • Socket.IO     │
                       │ • Rate Limiter  │
                       └─────────────────┘
```

## Database Schema

### Messages Table
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_type VARCHAR(20) NOT NULL DEFAULT 'text', -- text, image, file, system
  content TEXT NOT NULL,
  media_attachments JSONB, -- Array of media objects
  is_delivered BOOLEAN DEFAULT false,
  is_read BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  sent_at TIMESTAMP DEFAULT NOW(),
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX messages_chat_session_id_idx ON messages(chat_session_id);
CREATE INDEX messages_sender_id_idx ON messages(sender_id);
CREATE INDEX messages_is_delivered_idx ON messages(is_delivered);
CREATE INDEX messages_is_read_idx ON messages(is_read);
CREATE INDEX messages_sent_at_idx ON messages(sent_at);
CREATE INDEX messages_message_type_idx ON messages(message_type);
```

### Media Attachments Structure
```typescript
interface MessageMedia {
  publicId: string;        // Cloudinary public ID
  url: string;            // Original Cloudinary URL
  secureUrl: string;      // HTTPS Cloudinary URL
  width: number;          // Image width in pixels
  height: number;         // Image height in pixels
  format: string;         // Image format (webp, jpg, png)
  bytes: number;          // File size in bytes
  originalFilename?: string; // Original uploaded filename
  thumbnailUrl?: string;  // Optimized thumbnail URL
}
```

## Core Features

### 1. Text Messaging
- **Send/Receive**: Real-time text message delivery
- **Character Limit**: 5,000 characters per message
- **Validation**: Content sanitization and XSS protection
- **Rate Limiting**: Subscription-based daily limits

### 2. Image Messaging
- **Multi-Upload**: Up to 5 images per message
- **Size Limits**: 5MB per image, 10MB total per message
- **Formats**: JPG, JPEG, PNG, GIF, WebP
- **Compression**: Automatic optimization to 1-2MB
- **CDN Delivery**: Global Cloudinary CDN distribution

### 3. Message Management
- **Delivery Status**: WhatsApp-style delivery tracking (sent → delivered → read)
- **Read Receipts**: Track message read status with timestamps
- **Delivery Receipts**: Track message delivery status with timestamps
- **Soft Delete**: Messages marked as deleted, not physically removed
- **Search**: Full-text search within chat sessions
- **Pagination**: Efficient message loading with offset/limit

### 4. Security & Privacy
- **Participant Verification**: Users can only access their own chats
- **Content Validation**: Input sanitization and length limits
- **Media Validation**: File type, size, and malicious content checks
- **Rate Limiting**: Prevents spam and abuse

## API Endpoints

### Send Message
```http
POST /api/messages
Content-Type: multipart/form-data (for images) or application/json (for text)
Authorization: Bearer <token>
```

**Text Message:**
```json
{
  "chatSessionId": "uuid",
  "content": "Hello, how are you?",
  "messageType": "text"
}
```

**Image Message:**
```
Form Data:
- chatSessionId: "uuid"
- messageType: "image"
- content: "Optional caption" (optional)
- images: [File, File, ...] (max 5 files)
```

**Response:**
```json
{
  "success": true,
  "message": "Message sent successfully",
  "data": {
    "id": "msg-uuid",
    "chatSessionId": "chat-uuid",
    "senderId": "user-uuid",
    "messageType": "image",
    "content": "Optional caption",
    "mediaAttachments": [
      {
        "publicId": "callqr/messages/user123_1640995200000_abc123",
        "url": "https://res.cloudinary.com/cloud/image/upload/v123/callqr/messages/user123_1640995200000_abc123.webp",
        "secureUrl": "https://res.cloudinary.com/cloud/image/upload/v123/callqr/messages/user123_1640995200000_abc123.webp",
        "width": 1200,
        "height": 800,
        "format": "webp",
        "bytes": 156789,
        "originalFilename": "photo.jpg",
        "thumbnailUrl": "https://res.cloudinary.com/cloud/image/upload/w_150,h_150,c_fill,f_webp,q_auto/callqr/messages/user123_1640995200000_abc123"
      }
    ],
    "isDelivered": false,
    "isRead": false,
    "sentAt": "2024-01-01T12:00:00.000Z",
    "deliveredAt": null,
    "readAt": null
  }
}
```

### Get Messages
```http
GET /api/messages/:chatSessionId?limit=50&offset=0
Authorization: Bearer <token>
```

### Mark Message as Delivered
```http
PATCH /api/messages/:messageId/delivered
Authorization: Bearer <token>
```

### Mark All Chat Messages as Delivered
```http
PATCH /api/messages/chat/:chatSessionId/delivered
Authorization: Bearer <token>
```

### Get Message Delivery Status
```http
GET /api/messages/:messageId/status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Delivery status retrieved successfully",
  "data": {
    "sent": true,
    "delivered": true,
    "read": false,
    "sentAt": "2024-01-01T12:00:00.000Z",
    "deliveredAt": "2024-01-01T12:00:05.000Z",
    "readAt": null
  }
}
```

### Mark Message as Read
```http
PATCH /api/messages/:messageId/read
Authorization: Bearer <token>
```

### Mark All Chat Messages as Read
```http
PATCH /api/messages/chat/:chatSessionId/read
Authorization: Bearer <token>
```

### Delete Message
```http
DELETE /api/messages/:messageId
Authorization: Bearer <token>
```

### Get Unread Count
```http
GET /api/messages/unread/count
Authorization: Bearer <token>
```

### Search Messages
```http
GET /api/messages/:chatSessionId/search?query=search_term
Authorization: Bearer <token>
```

## Service Layer

### MessageService
**Core Methods:**
- `sendMessage()` - Send text or image messages with validation
- `getMessages()` - Retrieve paginated messages for a chat
- `markAsDelivered()` - Mark individual message as delivered
- `markChatMessagesAsDelivered()` - Mark all undelivered messages in chat as delivered
- `markAsRead()` - Mark individual message as read
- `markChatMessagesAsRead()` - Mark all unread messages in chat as read
- `getDeliveryStatus()` - Get delivery and read status for a message
- `deleteMessage()` - Soft delete message and cleanup media
- `searchMessages()` - Search messages within a chat session
- `getDailyMessageCount()` - Get user's daily message count for rate limiting

**Key Features:**
- Participant verification for all operations
- Subscription-based rate limiting
- Automatic media cleanup on deletion
- Content validation and sanitization

### MediaService
**Core Methods:**
- `validateImages()` - Validate uploaded files (size, format, count)
- `compressImage()` - Compress images using Sharp
- `uploadImage()` - Upload single image to Cloudinary
- `uploadImages()` - Batch upload multiple images
- `deleteImage()` - Remove image from Cloudinary
- `generateImageUrls()` - Create optimized image URLs

**Features:**
- Automatic WebP conversion
- Multiple image size variants
- Compression to target size (1-2MB)
- Comprehensive validation

## Media Upload Configuration

### Limits & Restrictions
```typescript
const MEDIA_CONFIG = {
  MAX_IMAGES_PER_MESSAGE: 5,
  MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
  COMPRESSED_SIZE: 2 * 1024 * 1024, // 2MB target
  MAX_TOTAL_UPLOAD: 10 * 1024 * 1024, // 10MB total
  ALLOWED_FORMATS: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  FOLDER: 'callqr/messages',
};
```

### Cloudinary Configuration
```typescript
const CLOUDINARY_UPLOAD_OPTIONS = {
  folder: 'callqr/messages',
  resource_type: 'image',
  format: 'webp', // Convert to WebP
  quality: 'auto:good',
  fetch_format: 'auto',
  flags: 'progressive',
  transformation: [
    {
      width: 1200,
      height: 1200,
      crop: 'limit',
      quality: 'auto:good',
    },
  ],
};
```

### Image Size Variants
Each uploaded image generates multiple optimized versions:
- **Thumbnail**: 150x150 (cropped, for chat previews)
- **Small**: 300x300 (max dimensions, for mobile)
- **Medium**: 600x600 (max dimensions, for tablets)
- **Large**: 1200x1200 (max dimensions, for desktop)
- **Original**: No transformations (full quality)

## Rate Limiting

### Subscription-Based Limits
```typescript
const DAILY_MESSAGE_LIMITS = {
  free: 50,        // 50 messages per day
  pro: 500,        // 500 messages per day
  enterprise: -1   // Unlimited
};
```

### Implementation
- Checked before each message send
- Counts reset daily at midnight
- Throws `TooManyRequestsError` when exceeded
- Bypassed for system messages

## Validation & Security

### Input Validation (Zod Schemas)
```typescript
const sendMessageSchema = z.object({
  body: z.object({
    chatSessionId: z.string().uuid(),
    content: z.string().max(5000).optional(),
    messageType: z.enum(['text', 'image', 'file', 'system']).default('text'),
  }).refine((data) => {
    // Content required for text messages
    if (data.messageType === 'text' && (!data.content || data.content.trim().length === 0)) {
      return false;
    }
    return true;
  }),
});
```

### File Upload Security
- **MIME Type Validation**: Only image/* types allowed
- **Extension Checking**: Whitelist of allowed extensions
- **Size Limits**: Individual and total upload limits
- **Malicious File Detection**: Sharp-based image processing validation
- **Memory Storage**: Files processed in memory (not saved to disk)

### Access Control
- **Participant Verification**: Users can only access chats they're part of
- **Message Ownership**: Users can only delete their own messages
- **Read Receipts**: Only non-senders can mark messages as read
- **Chat Session Validation**: All operations verify active chat status

## Error Handling

### Common Error Types
```typescript
// Rate limiting
throw new TooManyRequestsError('Daily message limit reached for free plan (50/50)');

// Access control
throw new ForbiddenError('You are not a participant in this chat');

// Validation
throw new BadRequestError('Message content exceeds maximum length of 5000 characters');

// Media upload
throw new BadRequestError('Image validation failed: File size exceeds 5MB limit');

// Not found
throw new NotFoundError('Message not found');
```

### Error Response Format
```json
{
  "success": false,
  "message": "Error description",
  "stack": "Error stack trace (development only)"
}
```

## Real-time Integration

### Socket.IO Events
The message module integrates with Socket.IO for real-time delivery:

```typescript
// After successful message send
socket.to(chatSessionId).emit('new-message', {
  messageId: message.id,
  senderId: message.senderId,
  content: message.content,
  messageType: message.messageType,
  mediaAttachments: message.mediaAttachments,
  sentAt: message.sentAt
});

// Delivery receipt updates
socket.to(chatSessionId).emit('message-delivered', {
  messageId: message.id,
  deliveredBy: userId,
  deliveredAt: message.deliveredAt
});

// Read receipt updates
socket.to(chatSessionId).emit('message-read', {
  messageId: message.id,
  readBy: userId,
  readAt: message.readAt
});
```

### Message Status Flow
1. **Sent**: Message created in database (`sentAt` timestamp)
2. **Delivered**: Recipient receives message (`isDelivered = true`, `deliveredAt` timestamp)
3. **Read**: Recipient reads message (`isRead = true`, `readAt` timestamp)

This follows WhatsApp-style delivery tracking with visual indicators:
- ✓ Single check: Sent
- ✓✓ Double check: Delivered  
- ✓✓ Blue double check: Read

## Performance Optimizations

### Database
- **Indexes**: Optimized queries on frequently accessed columns
- **Pagination**: Efficient offset/limit queries
- **Soft Deletes**: Avoid expensive DELETE operations
- **JSON Indexing**: JSONB for flexible media metadata storage

### Media Processing
- **Compression**: Automatic image optimization
- **CDN Caching**: Global edge caching via Cloudinary
- **Format Optimization**: WebP conversion for smaller file sizes
- **Progressive Loading**: Images load progressively for better UX

### Caching Strategy
- **Cloudinary CDN**: Automatic global caching
- **Browser Caching**: Proper cache headers for media
- **Database Connection Pooling**: Efficient connection management

## Monitoring & Logging

### Health Checks
```http
GET /healthz
```
Returns status of all services including Cloudinary connection.

### Logging Events
- Message send/receive operations
- Media upload/delete operations
- Rate limit violations
- Error conditions
- Service health status

### Metrics Tracked
- Daily message counts per user
- Media upload success/failure rates
- Chat session activity
- Error rates by type
- Response times

## Testing

### Unit Tests
```bash
npm test -- --testPathPattern=message
```

### Integration Tests
```bash
# Test Cloudinary connection
npm run test:cloudinary

# Test media upload API
TEST_TOKEN=jwt TEST_CHAT_ID=uuid node scripts/test-media-upload.js
```

### Manual Testing
```bash
# Health check
curl http://localhost:9001/healthz

# Send text message
curl -X POST http://localhost:9001/api/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"chatSessionId":"uuid","content":"Hello","messageType":"text"}'

# Send image message
curl -X POST http://localhost:9001/api/messages \
  -H "Authorization: Bearer $TOKEN" \
  -F "chatSessionId=uuid" \
  -F "messageType=image" \
  -F "content=Photo caption" \
  -F "images=@photo.jpg"
```

## Deployment Considerations

### Environment Variables
```env
# Cloudinary (Required for media uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Database (Required)
DATABASE_URL=postgres://user:pass@host:port/db

# Security (Required)
JWT_SECRET=your_jwt_secret
ENCRYPTION_KEY=your_32_byte_hex_key
```

### Production Checklist
- [ ] Cloudinary credentials configured
- [ ] Database indexes created
- [ ] Rate limiting configured
- [ ] CORS origins restricted
- [ ] SSL/HTTPS enabled
- [ ] Error monitoring setup
- [ ] Log aggregation configured
- [ ] Health check monitoring
- [ ] Backup strategy for media

### Scaling Considerations
- **Database**: Consider read replicas for message retrieval
- **Media Storage**: Cloudinary handles CDN scaling automatically
- **Rate Limiting**: Redis-based rate limiting for multi-instance deployments
- **Real-time**: Socket.IO clustering for horizontal scaling

## Troubleshooting

### Common Issues

**1. Cloudinary Upload Fails**
```
Error: Invalid cloud name
Solution: Check CLOUDINARY_CLOUD_NAME in .env
```

**2. Rate Limit Exceeded**
```
Error: Daily message limit reached for free plan
Solution: Upgrade subscription or wait for daily reset
```

**3. File Upload Rejected**
```
Error: File size exceeds 5MB limit
Solution: Compress image or use smaller file
```

**4. Message Not Found**
```
Error: You are not a participant in this chat
Solution: Verify user has access to the chat session
```

**5. Route Not Found (404)**
```
Error: Cannot GET /api/messages/unread/count
Solution: Ensure correct endpoint URLs and route order
```

**6. Chat Session Errors (403)**
```
Error: You are not a participant in this chat
Solution: Verify chatSessionId exists and user has access
```

### Debug Commands
```bash
# Check service health
curl http://localhost:9001/healthz

# Test Cloudinary connection
npm run test:cloudinary

# Check database connection
npm run db:studio

# View server logs
npm run dev

# Test specific endpoints
curl -H "Authorization: Bearer TOKEN" http://localhost:9001/api/messages/unread/count
```

## Recent Issues Fixed

### Critical Route Conflicts (Fixed)
**Issue**: Route order conflict causing endpoints to be unreachable.
- `/api/messages/unread/count` was returning 404
- `/api/messages/{chatSessionId}/search` was not working
- **Fix**: Reordered routes to put specific paths before parameterized ones

### SQL Security Improvements (Fixed)
**Issue**: Potential SQL injection risk in `getUnreadCount()` method.
- Unsafe `ANY()` SQL usage with user-provided data
- **Fix**: Replaced with Drizzle's safe `inArray()` function

### Performance Optimizations (Fixed)
**Issue**: Inefficient database queries for users with many chat sessions.
- Poor performance with large chat session arrays
- **Fix**: Optimized queries using proper Drizzle ORM methods

### Enhanced Input Validation (Fixed)
**Issue**: Missing validation for chat session IDs.
- Potential crashes with malformed UUIDs
- **Fix**: Added comprehensive input validation and error handling

## Future Enhancements

### Planned Features
- [ ] Voice message support
- [ ] Video message support
- [ ] File attachment support (PDF, documents)
- [ ] Message reactions/emojis
- [ ] Message editing functionality
- [ ] Message forwarding
- [ ] Bulk message operations
- [ ] Message encryption at rest
- [ ] Advanced search filters
- [ ] Message analytics dashboard

### Technical Improvements
- [ ] Message caching layer
- [ ] Webhook support for external integrations
- [ ] Message export functionality
- [ ] Advanced media processing (filters, effects)
- [ ] Message scheduling
- [ ] Auto-delete messages (ephemeral messaging)
- [ ] Message templates
- [ ] Rich text formatting support

## Conclusion

The Message Module provides a complete, production-ready messaging solution with comprehensive features for text and media messaging. It's built with security, scalability, and performance in mind, supporting real-time communication with proper rate limiting, validation, and error handling.

The module is fully integrated with Cloudinary for media storage and processing, includes comprehensive API documentation, and provides extensive monitoring and health checking capabilities. It's ready for production deployment and can scale to handle high-volume messaging workloads.