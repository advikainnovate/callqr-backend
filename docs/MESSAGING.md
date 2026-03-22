# 💬 Messaging

> Covers chat sessions, real-time messaging via Socket.IO, media uploads, delivery receipts, and push notification fallback.

---

## How It Works

```
Scan QR code → POST /chats/initiate → chatSessionId
        │
        └─ Socket: join-chat { chatSessionId }   ← do this immediately
                   │
        Send message: POST /messages
                   │
            Server saves to DB
                   │
            Server emits new-message
            to chat:<chatSessionId> room
                   │
            ┌──────┴──────┐
        Recipient      Recipient
         online         offline
            │               │
       new-message     FCM push
       via socket      → tray notification
```

> ⚠️ There is NO `chat-message` socket emit from the client anymore.
> The client only calls `POST /messages`. The server handles all real-time delivery.

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
GET   /api/chat-sessions/my-chats             All your chat sessions (preferred)
GET   /api/chat-sessions/my/all               All your chat sessions (alias)
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

| Icon      | Meaning   |
| --------- | --------- |
| ✓         | Sent      |
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

### Connection

```javascript
const socket = io(SERVER_URL, {
  path: '/socket.io',
  transports: ['websocket'],
  auth: { token: 'Bearer <access_token>' },
});
```

### When to join chat rooms

Join rooms as early as possible — on login or app open — so messages are never missed.

```javascript
// On connect: rejoin all active chats
socket.on('connect', () => {
  activeChats.forEach(({ id }) => {
    socket.emit('join-chat', { chatSessionId: id });
  });
});

// After initiating a new chat
const { data } = await api.post('/chat-sessions/initiate', { qrToken });
socket.emit('join-chat', { chatSessionId: data.data.id });

// Confirm
socket.on('chat-joined', ({ chatSessionId }) => {
  console.log('Joined room:', chatSessionId);
});
```

> The server verifies you are a participant before allowing you into the room.
> If you are not a participant, you receive an `error` event and are not joined.

### Send a message — REST only, no socket emit

```javascript
// Just call REST. Server emits new-message to the room automatically.
const { data } = await api.post('/messages', {
  chatSessionId,
  content: text,
  messageType: 'text',
});
// data.data contains the full message — render it locally immediately
```

### Receive messages

The `new-message` event carries the full message payload — no extra REST fetch needed.

```javascript
socket.on('new-message', message => {
  // message shape:
  // {
  //   id, chatSessionId, senderId, messageType,
  //   content, mediaAttachments, isDelivered, isRead, sentAt
  // }
  appendMessage(message);

  // Send receipts
  socket.emit('message-delivered', {
    chatSessionId: message.chatSessionId,
    messageId: message.id,
  });

  // If the chat screen is currently open and visible
  if (isChatOpen(message.chatSessionId)) {
    socket.emit('message-read', {
      chatSessionId: message.chatSessionId,
      messageId: message.id,
    });
  }
});
```

### Delivery & read tick updates

```javascript
socket.on('message-delivered', ({ messageId, deliveredAt }) => {
  updateTick(messageId, '✓✓');
});

socket.on('message-read', ({ messageId, readAt }) => {
  updateTick(messageId, '✓✓🔵');
});
```

### Typing indicators

```javascript
const stopTyping = debounce(
  () => socket.emit('typing-stop', { chatSessionId }),
  1500
);

const onTextChange = () => {
  socket.emit('typing-start', { chatSessionId });
  stopTyping();
};

socket.on('user-typing', ({ userId }) => showTypingIndicator(userId));
socket.on('user-stopped-typing', ({ userId }) => hideTypingIndicator(userId));
```

### Leave the room (on navigating away from chat screen)

```javascript
socket.emit('leave-chat', { chatSessionId });
```

---

## Socket Events Reference

### Client → Server

| Event               | Payload                        | When to emit                        |
| ------------------- | ------------------------------ | ----------------------------------- |
| `join-chat`         | `{ chatSessionId }`            | On connect, on new chat created     |
| `leave-chat`        | `{ chatSessionId }`            | On navigating away from chat screen |
| `typing-start`      | `{ chatSessionId }`            | On text input change                |
| `typing-stop`       | `{ chatSessionId }`            | After 1.5s of no typing             |
| `message-delivered` | `{ chatSessionId, messageId }` | On receiving `new-message`          |
| `message-read`      | `{ chatSessionId, messageId }` | When chat is open and visible       |

> `chat-message` is removed. Do not emit it.

### Server → Client

| Event                 | Payload                                                                                                | Meaning                      |
| --------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `chat-joined`         | `{ chatSessionId }`                                                                                    | Room join confirmed          |
| `new-message`         | `{ id, chatSessionId, senderId, messageType, content, mediaAttachments, isDelivered, isRead, sentAt }` | New message received         |
| `message-delivered`   | `{ messageId, chatSessionId, deliveredBy, deliveredAt }`                                               | Other party received message |
| `message-read`        | `{ messageId, chatSessionId, readBy }`                                                                 | Other party read message     |
| `user-typing`         | `{ chatSessionId, userId }`                                                                            | Other party is typing        |
| `user-stopped-typing` | `{ chatSessionId, userId }`                                                                            | Other party stopped typing   |
| `error`               | `{ message }`                                                                                          | Something went wrong         |

---

## Push Notification Fallback

If the recipient is **not connected to the socket**, the backend automatically sends an FCM push notification.

See [PUSH_NOTIFICATIONS.md](./PUSH_NOTIFICATIONS.md) for setup.

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

> Image messages show `"📎 Sent an attachment"` as the preview — never the file content.

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
| Room join auth           | Server checks participant status before joining socket room |
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
