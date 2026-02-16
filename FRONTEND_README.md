# Frontend Integration Guide

Complete guide for connecting your frontend to the backend API.

## 🚀 Quick Setup

### Install Dependencies
```bash
npm install socket.io-client axios
```

### Basic Connection
```javascript
import io from 'socket.io-client';
import axios from 'axios';

const API_URL = 'https://your-api-domain.com';

// HTTP Client
const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Socket.IO Client
const socket = io(API_URL, {
  transports: ['websocket'],
  auth: { token: localStorage.getItem('authToken') }
});
```

## 📱 Complete Flow

### 1. Register User
```javascript
const response = await api.post('/users/register', {
  username: 'testuser',
  phone: '+1234567890',
  email: 'test@example.com'
});
const userId = response.data.data.userId;
```

### 2. Get JWT Token
Generate token using backend script:
```bash
node scripts/generate-test-token.js USER_ID USERNAME
```
Then store it:
```javascript
localStorage.setItem('authToken', 'YOUR_GENERATED_TOKEN');
```

### 3. Create & Assign QR Code

**Option A: Admin Pre-generates QR Codes**
```javascript
// Bulk create QR codes (admin)
const bulkResponse = await api.post('/qr-codes/bulk-create', {
  count: 100
});

// Each QR code has:
// - token: "a1b2c3d4..." (64-char hex for QR image)
// - humanToken: "QR-K9F7-M2QX" (for manual entry)
// - status: "unassigned"
```

**Option B: User Claims QR Code**
```javascript
// Method 1: User types human-readable code
const claimResponse = await api.post('/qr-codes/claim', {
  humanToken: 'QR-K9F7-M2QX'
});

// Method 2: User scans unassigned QR code
const scanResponse = await api.post('/qr-codes/scan', {
  token: 'SCANNED_TOKEN'
});

// If status is 'unassigned', show claim prompt
if (scanResponse.data.data.qrCode.status === 'unassigned') {
  const claimResponse = await api.post('/qr-codes/claim', {
    token: 'SCANNED_TOKEN'
  });
}

// Get QR code image URL
const qrImageUrl = `${API_URL}/api/qr-codes/image/${token}`;
```

### 4. Scan QR Code
```javascript
const scanResponse = await api.post('/qr-codes/scan', {
  token: 'SCANNED_QR_TOKEN'
});
const scannedUser = scanResponse.data.data; // { id, username, status }
```

### 5A. Start Call (WebRTC)
```javascript
// Initiate call
const callResponse = await api.post('/calls/initiate', {
  qrToken: 'SCANNED_QR_TOKEN'
});
const callId = callResponse.data.data.id;

// Get ICE servers
const configResponse = await api.get('/webrtc/config');
const { iceServers } = configResponse.data.data;

// Setup WebRTC
const peerConnection = new RTCPeerConnection({ iceServers });

// Get local media
const localStream = await navigator.mediaDevices.getUserMedia({
  audio: true,
  video: true
});

localStream.getTracks().forEach(track => {
  peerConnection.addTrack(track, localStream);
});

// Handle ICE candidates
peerConnection.onicecandidate = (event) => {
  if (event.candidate) {
    socket.emit('webrtc-signal', {
      type: 'ice-candidate',
      callId,
      targetUserId: 'RECEIVER_ID',
      data: event.candidate
    });
  }
};

// Handle remote stream
peerConnection.ontrack = (event) => {
  remoteVideo.srcObject = event.streams[0];
};

// Create offer
const offer = await peerConnection.createOffer();
await peerConnection.setLocalDescription(offer);

socket.emit('webrtc-signal', {
  type: 'offer',
  callId,
  targetUserId: 'RECEIVER_ID',
  data: offer
});

// Listen for signals
socket.on('webrtc-signal', async (data) => {
  if (data.type === 'offer') {
    await peerConnection.setRemoteDescription(data.data);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('webrtc-signal', {
      type: 'answer',
      callId: data.callId,
      targetUserId: data.fromUserId,
      data: answer
    });
  } else if (data.type === 'answer') {
    await peerConnection.setRemoteDescription(data.data);
  } else if (data.type === 'ice-candidate') {
    await peerConnection.addIceCandidate(data.data);
  }
});

// Listen for incoming calls
socket.on('incoming-call', (data) => {
  console.log('Incoming call:', data.callId, data.callerId);
  // Show incoming call UI
});

// Accept call
await api.patch(`/calls/${callId}/accept`);
socket.emit('accept-call', { callId });

// Reject call
await api.patch(`/calls/${callId}/reject`);
socket.emit('reject-call', { callId });

// End call
await api.patch(`/calls/${callId}/end`);
socket.emit('end-call', { callId });
```

### 5B. Start Chat
```javascript
// Initiate chat
const chatResponse = await api.post('/chat-sessions/initiate', {
  qrToken: 'SCANNED_QR_TOKEN'
});
const chatSessionId = chatResponse.data.data.id;

// Join chat room
socket.emit('join-chat', { chatSessionId });

// Send message
const msgResponse = await api.post('/messages/send', {
  chatSessionId,
  content: 'Hello!',
  messageType: 'text'
});

socket.emit('chat-message', {
  chatSessionId,
  messageId: msgResponse.data.data.id
});

// Listen for new messages
socket.on('new-message', async (data) => {
  console.log('New message:', data.messageId);
  // Fetch and display message
  const messages = await api.get(`/messages/${chatSessionId}`);
  // Update UI
});

// Typing indicators
socket.emit('typing-start', { chatSessionId });
socket.emit('typing-stop', { chatSessionId });

socket.on('user-typing', (data) => {
  // Show "User is typing..."
});

socket.on('user-stopped-typing', (data) => {
  // Hide typing indicator
});

// Mark as read
await api.patch(`/messages/${messageId}/read`);
socket.emit('message-read', { chatSessionId, messageId });

socket.on('message-read', (data) => {
  // Update UI with read receipt (✓✓)
});

// Get messages
const messages = await api.get(`/messages/${chatSessionId}?limit=50&offset=0`);

// Search messages
const results = await api.get(`/messages/${chatSessionId}/search?query=hello`);

// Get unread count
const unreadResponse = await api.get('/messages/unread-count');
const unreadCount = unreadResponse.data.data.unreadCount;

// End chat
await api.patch(`/chat-sessions/${chatSessionId}/end`);
socket.emit('leave-chat', { chatSessionId });
```

## 📡 Socket.IO Events

### Call Events
```javascript
// Client → Server
socket.emit('initiate-call', { callId });
socket.emit('accept-call', { callId });
socket.emit('reject-call', { callId });
socket.emit('end-call', { callId });
socket.emit('webrtc-signal', { type, callId, targetUserId, data });

// Server → Client
socket.on('incoming-call', (data) => {}); // { callId, callerId }
socket.on('call-accepted', (data) => {}); // { callId, receiverId }
socket.on('call-rejected', (data) => {}); // { callId, receiverId }
socket.on('call-ended', (data) => {}); // { callId, endedBy }
socket.on('webrtc-signal', (data) => {}); // { type, callId, fromUserId, data }
```

### Chat Events
```javascript
// Client → Server
socket.emit('join-chat', { chatSessionId });
socket.emit('leave-chat', { chatSessionId });
socket.emit('chat-message', { chatSessionId, messageId });
socket.emit('typing-start', { chatSessionId });
socket.emit('typing-stop', { chatSessionId });
socket.emit('message-read', { chatSessionId, messageId });

// Server → Client
socket.on('new-message', (data) => {}); // { chatSessionId, messageId, senderId }
socket.on('message-delivered', (data) => {}); // { chatSessionId, messageId }
socket.on('message-read', (data) => {}); // { chatSessionId, messageId, readBy }
socket.on('user-typing', (data) => {}); // { chatSessionId, userId }
socket.on('user-stopped-typing', (data) => {}); // { chatSessionId, userId }
```

## 🎯 Key Endpoints

| Action | Method | Endpoint |
|--------|--------|----------|
| Register | POST | `/api/users/register` |
| Get Profile | GET | `/api/users/profile` |
| Bulk Create QR | POST | `/api/qr-codes/bulk-create` |
| Claim QR | POST | `/api/qr-codes/claim` |
| Scan QR | POST | `/api/qr-codes/scan` |
| QR Image | GET | `/api/qr-codes/image/:token` |
| Start Call | POST | `/api/calls/initiate` |
| Accept Call | PATCH | `/api/calls/:id/accept` |
| Reject Call | PATCH | `/api/calls/:id/reject` |
| End Call | PATCH | `/api/calls/:id/end` |
| Get ICE Config | GET | `/api/webrtc/config` |
| Start Chat | POST | `/api/chat-sessions/initiate` |
| Get Chat | GET | `/api/chat-sessions/:id` |
| My Chats | GET | `/api/chat-sessions/my-chats` |
| End Chat | PATCH | `/api/chat-sessions/:id/end` |
| Send Message | POST | `/api/messages/send` |
| Get Messages | GET | `/api/messages/:chatId` |
| Mark Read | PATCH | `/api/messages/:id/read` |
| Unread Count | GET | `/api/messages/unread-count` |
| Search Messages | GET | `/api/messages/:chatId/search` |

## 📊 Subscription Limits

| Plan | Daily Calls | Daily Messages | Active Chats |
|------|-------------|----------------|--------------|
| Free | 20 | 100 | 5 |
| Pro | 80 | 500 | 20 |
| Enterprise | 200 | Unlimited | Unlimited |

Check limits:
```javascript
const usage = await api.get('/subscriptions/usage');
// { dailyCallCount, dailyCallLimit, dailyMessageCount, dailyMessageLimit }
```

## 🚨 Error Handling

```javascript
api.interceptors.response.use(
  response => response,
  error => {
    const { status, data } = error.response;
    
    if (status === 401) {
      // Unauthorized - redirect to login
    } else if (status === 429) {
      // Rate limit exceeded
      alert(data.message);
    } else if (status === 404) {
      // Not found
    }
    
    return Promise.reject(error);
  }
);
```

## 🔐 Authentication

All requests need JWT token:
```javascript
Authorization: Bearer YOUR_JWT_TOKEN
```

Socket.IO needs token in auth:
```javascript
socket.auth.token = 'YOUR_JWT_TOKEN';
```

## 📝 Response Format

All API responses:
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { /* your data */ }
}
```

## 🔗 Resources

- **API Docs**: `https://your-api-domain.com/api-docs`
- **Health Check**: `https://your-api-domain.com/healthz`
- **Backend README**: [README.md](README.md)

---

**Ready to build!** 🎉
