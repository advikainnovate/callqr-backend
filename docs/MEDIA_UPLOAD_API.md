# Media Upload API Documentation

## Overview

The messaging system supports image uploads with the following specifications:

### Media Limitations
- **Max images per message**: 5
- **Max image size**: 5MB per image
- **Compressed size**: 1-2MB (automatic compression)
- **Total upload per message**: 10MB
- **Supported formats**: JPG, JPEG, PNG, GIF, WebP

### Storage
- **Provider**: Cloudinary
- **Compression**: Automatic WebP conversion with quality optimization
- **CDN**: Global delivery via Cloudinary CDN
- **Transformations**: Multiple sizes generated (thumbnail, small, medium, large)

## API Endpoints

### Send Message with Images

```http
POST /api/messages
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

**Form Data:**
```
chatSessionId: "uuid-string"
content: "Optional caption text" (optional for image messages)
messageType: "image"
images: [File, File, ...] (max 5 files)
```

**Example using curl:**
```bash
curl -X POST http://localhost:9001/api/messages \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "chatSessionId=123e4567-e89b-12d3-a456-426614174000" \
  -F "messageType=image" \
  -F "content=Check out these photos!" \
  -F "images=@photo1.jpg" \
  -F "images=@photo2.png"
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
    "content": "Check out these photos!",
    "mediaAttachments": [
      {
        "publicId": "callqr/messages/user123_1640995200000_abc123",
        "url": "https://res.cloudinary.com/yourcloud/image/upload/v1640995200/callqr/messages/user123_1640995200000_abc123.webp",
        "secureUrl": "https://res.cloudinary.com/yourcloud/image/upload/v1640995200/callqr/messages/user123_1640995200000_abc123.webp",
        "width": 1200,
        "height": 800,
        "format": "webp",
        "bytes": 156789,
        "originalFilename": "photo1.jpg",
        "thumbnailUrl": "https://res.cloudinary.com/yourcloud/image/upload/w_150,h_150,c_fill,f_webp,q_auto/callqr/messages/user123_1640995200000_abc123"
      }
    ],
    "isRead": false,
    "sentAt": "2024-01-01T12:00:00.000Z"
  }
}
```

## Image URL Variants

Each uploaded image automatically generates multiple optimized versions:

```javascript
const imageUrls = {
  thumbnail: "w_150,h_150,c_fill,f_webp,q_auto",     // 150x150 cropped
  small: "w_300,h_300,c_limit,f_webp,q_auto",        // Max 300x300
  medium: "w_600,h_600,c_limit,f_webp,q_auto",       // Max 600x600  
  large: "w_1200,h_1200,c_limit,f_webp,q_auto",      // Max 1200x1200
  original: "" // No transformations
};
```

## Error Responses

### File Size Exceeded
```json
{
  "success": false,
  "message": "File size exceeds 5MB limit"
}
```

### Too Many Files
```json
{
  "success": false,
  "message": "Maximum 5 images allowed"
}
```

### Invalid Format
```json
{
  "success": false,
  "message": "Invalid file format. Allowed: jpg, jpeg, png, gif, webp"
}
```

### Total Size Exceeded
```json
{
  "success": false,
  "message": "Image validation failed: Total upload size exceeds 10MB limit"
}
```

## Frontend Integration Examples

### HTML Form
```html
<form id="messageForm" enctype="multipart/form-data">
  <input type="hidden" name="chatSessionId" value="chat-uuid">
  <input type="hidden" name="messageType" value="image">
  <textarea name="content" placeholder="Add a caption..."></textarea>
  <input type="file" name="images" multiple accept="image/*" max="5">
  <button type="submit">Send Images</button>
</form>
```

### JavaScript (Fetch API)
```javascript
async function sendImages(chatSessionId, files, caption = '') {
  const formData = new FormData();
  formData.append('chatSessionId', chatSessionId);
  formData.append('messageType', 'image');
  formData.append('content', caption);
  
  // Add multiple files
  for (let i = 0; i < files.length; i++) {
    formData.append('images', files[i]);
  }

  const response = await fetch('/api/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  return response.json();
}
```

### React Example
```jsx
import { useState } from 'react';

function ImageUpload({ chatSessionId, onSend }) {
  const [files, setFiles] = useState([]);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (files.length === 0) return;

    setUploading(true);
    try {
      const result = await sendImages(chatSessionId, files, caption);
      onSend(result.data);
      setFiles([]);
      setCaption('');
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="file"
        multiple
        accept="image/*"
        onChange={(e) => setFiles(Array.from(e.target.files))}
        disabled={uploading}
      />
      <input
        type="text"
        placeholder="Add a caption..."
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        disabled={uploading}
      />
      <button type="submit" disabled={uploading || files.length === 0}>
        {uploading ? 'Uploading...' : `Send ${files.length} image(s)`}
      </button>
    </form>
  );
}
```

## Environment Setup

Add these variables to your `.env` file:

```env
# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

## Database Migration

Run this SQL to add the media_attachments column:

```sql
ALTER TABLE messages ADD COLUMN media_attachments JSONB;
CREATE INDEX IF NOT EXISTS messages_message_type_idx ON messages(message_type);
```

Or use the provided script:
```bash
psql $DATABASE_URL -f scripts/add-media-attachments.sql
```

## Security Features

1. **File Type Validation**: Only image MIME types allowed
2. **Size Limits**: Individual and total upload limits enforced
3. **Automatic Compression**: Images optimized for web delivery
4. **Secure URLs**: All URLs use HTTPS
5. **User Context**: Images tagged with uploader user ID
6. **Cleanup**: Deleted messages remove associated Cloudinary assets

## Performance Optimizations

1. **WebP Conversion**: Automatic format optimization
2. **Progressive Loading**: Images load progressively
3. **CDN Delivery**: Global edge caching via Cloudinary
4. **Multiple Sizes**: Responsive image loading
5. **Lazy Loading**: Thumbnail URLs for chat previews