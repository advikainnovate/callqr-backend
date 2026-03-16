# 💬 Messaging

> Covers chat sessions, real-time messaging via Socket.IO, media uploads, delivery receipts, and push notification fallback.

---

## How It Works

```
Scan QR code → POST /chats/initiate → chatSessionId
        │
        ├─ Socket: join-chat { chatSessionId }
        │
        ├─ Send message: POST /messages → messageId
        │
        └─ Socket: chat-message { chatSessionId, messageId }
                   │
            ┌──────┴──────┐
        Recipient      Recipient
         online         offline
            │               │
       new-message     FCM push
       via socket      → tray notification
```

---

## Chat Sessions

### Start a chat

```
POST /api/chat-sessions/initiate
Authorization: Bearer <token>

Body: { "qrToken": "QR_TOKEN_OF_OTHER_USER" }

Response 201:
{
  "data": {
    "id": "uuid",
    "participant1Id": "uuid",
    "participant2Id": "uuid",
    "status": "active",
    "startedAt": "..."
  }
}
```

> If a chat between these two users already exists and is active, the existing session is returned.

### Chat session endpoints

```
GET   /api/chat-sessions/my/all               All your chat sessions
GET   /api/chat-sessions/active/list          Active sessions only
GET   /api/chat-sessions/:chatSessionId       Full session details
PATCH /api/chat-sessions/:chatSessionId/end   End a chat
PATCH /api/chat-sessions/:chatSessionId/block Block a chat
```

---

## Sending Messages

### Text message (JSON)

```
POST /api/messages
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "chatSessionId": "uuid",
  "content": "Hey! How are you?",
  "messageType": "text"
}
```

### Image message (multipart)

```
POST /api/messages
Authorization: Bearer <token>
Content-Type: multipart/form-data

Fields:
  chatSessionId  uuid (required)
  messageType    "image"
  content        "Optional caption" (optional)
  images         up to 5 image files
```

**Image limits:**

| Limit                 | Value                     |
| --------------------- | ------------------------- |
| Max files per message | 5                         |
| Max size per image    | 5 MB                      |
| Max total per message | 10 MB                     |
| Accepted formats      | JPG, JPEG, PNG, GIF, WebP |
| Stored format         | WebP (auto-converted)     |
| Max stored size       | ~2 MB (auto-compressed)   |

**Response (both text and image):**

```json
{
  "data": {
    "id": "uuid",
    "chatSessionId": "uuid",
    "senderId": "uuid",
    "messageType": "image",
    "content": "Optional caption",
    "mediaAttachments": [
      {
        "publicId": "callqr/messages/user123_1640995200000_abc",
        "url": "https://res.cloudinary.com/...",
        "secureUrl": "https://res.cloudinary.com/...",
        "width": 1200,
        "height": 800,
        "format": "webp",
        "bytes": 156789,
        "originalFilename": "photo.jpg",
        "thumbnailUrl": "https://res.cloudinary.com/.../w_150,h_150,c_fill,..."
      }
    ],
    "isDelivered": false,
    "isRead": false,
    "sentAt": "2026-03-16T07:00:00Z"
  }
}
```

> After saving via REST, **always emit the socket event** to deliver in real-time (see Socket section).

---

## Image URL Variants

Each uploaded image auto-generates these Cloudinary variants:

| Variant     | Dimensions        | Use For           |
| ----------- | ----------------- | ----------------- |
| `thumbnail` | 150×150 (cropped) | Chat list preview |
| `small`     | max 300×300       | Mobile view       |
| `medium`    | max 600×600       | Tablet view       |
| `large`     | max 1200×1200     | Full view         |

---

## Reading Messages

```
GET /api/messages/:chatSessionId?limit=50&offset=0
```

### Delivery & read receipts

```
PATCH /api/messages/:messageId/delivered
PATCH /api/messages/:messageId/read
PATCH /api/messages/chat/:chatSessionId/delivered   // bulk
PATCH /api/messages/chat/:chatSessionId/read        // bulk
```

### Status check

```
GET /api/messages/:messageId/status

Response:
{
  "data": {
    "sent": true,
    "delivered": true,
    "read": false,
    "sentAt": "...",
    "deliveredAt": "...",
    "readAt": null
  }
}
```

**WhatsApp-style status indicators:**

| ✓         | Sent      |
| --------- | --------- |
| ✓✓        | Delivered |
| ✓✓ (blue) | Read      |

### Other message endpoints

```
GET    /api/messages/unread/count
GET    /api/messages/:chatSessionId/search?q=hello
DELETE /api/messages/:messageId    // sender only, soft-delete
```

---

## Socket.IO — Real-time Delivery

### Join a chat room (do this on entering the chat screen)

```javascript
socket.emit('join-chat', { chatSessionId });
socket.on('chat-joined', ({ chatSessionId }) => {
  /* ready */
});
```

### Send a message (REST first, then socket)

```javascript
// 1. Persist via REST
const { data: msg } = await api.post('/messages', {
  chatSessionId,
  content: text,
  messageType: 'text',
});

// 2. Real-time delivery via socket
socket.emit('chat-message', { chatSessionId, messageId: msg.data.id });
```

### Receive messages

```javascript
socket.on('new-message', async ({ chatSessionId, messageId, senderId }) => {
  // Fetch messages from REST to get content
  const msgs = await api.get(`/messages/${chatSessionId}`);
  renderMessages(msgs.data.data);

  // Acknowledge receipts
  socket.emit('message-delivered', { chatSessionId, messageId });
  socket.emit('message-read', { chatSessionId, messageId }); // if chat is open
});
```

### Delivery tick updates

```javascript
socket.on('message-delivered', ({ messageId }) => updateTick(messageId, '✓✓'));
socket.on('message-read', ({ messageId }) => updateTick(messageId, '✓✓🔵'));
```

### Typing indicators

```javascript
// Debounce the stop event
const stopTyping = debounce(
  () => socket.emit('typing-stop', { chatSessionId }),
  1500
);

const onTextChange = () => {
  socket.emit('typing-start', { chatSessionId });
  stopTyping();
};

socket.on('user-typing', () => showTypingIndicator());
socket.on('user-stopped-typing', () => hideTypingIndicator());
```

### Leave the room (do this on navigating away)

```javascript
socket.emit('leave-chat', { chatSessionId });
```

---

## Push Notification Fallback

If the recipient is **not connected to the socket**, the backend automatically sends an FCM push notification instead.

See [PUSH_NOTIFICATIONS.md](./PUSH_NOTIFICATIONS.md) for the full setup guide.

**What the recipient receives:**

```json
{
  "notification": { "title": "john_doe", "body": "Hey! How are you?" },
  "data": {
    "type": "new_message",
    "chatSessionId": "uuid",
    "senderId": "uuid",
    "senderUsername": "john_doe"
  }
}
```

> Image messages show `"📎 Sent an attachment"` in the preview — never the file content.

---

## Rate Limits (Subscription-based)

| Plan       | Messages/day |
| ---------- | ------------ |
| FREE       | 100          |
| PRO        | 500          |
| ENTERPRISE | Unlimited    |

Exceeding the limit returns `429 Too Many Requests`.

---

## Security

| Check                    | Detail                                                      |
| ------------------------ | ----------------------------------------------------------- |
| Participant verification | Every message read/write verifies the user is in that chat  |
| Block check              | If either user has blocked the other, messages are rejected |
| Sender-only delete       | Only the original sender can delete their message           |
| Media validation         | MIME type, file size, and Sharp processing validation       |
| Media cleanup            | Deleted messages remove Cloudinary assets automatically     |

---

## Environment Variables

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```
