import { v2 as cloudinary } from 'cloudinary';
import { appConfig } from './index';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export { cloudinary };

// Media upload configuration
export const MEDIA_CONFIG = {
  MAX_IMAGES_PER_MESSAGE: 5,
  MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
  COMPRESSED_SIZE: 2 * 1024 * 1024, // 2MB target
  MAX_TOTAL_UPLOAD: 10 * 1024 * 1024, // 10MB total per message
  ALLOWED_FORMATS: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  FOLDER: 'callqr/messages',
};

export const CLOUDINARY_UPLOAD_OPTIONS = {
  folder: MEDIA_CONFIG.FOLDER,
  resource_type: 'image' as const,
  format: 'webp', // Convert to WebP for better compression
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