import multer from 'multer';
import { Request } from 'express';
import { MEDIA_CONFIG } from '../config/cloudinary';
import { BadRequestError } from '../utils';

// Configure multer for memory storage (we'll upload to Cloudinary)
const storage = multer.memoryStorage();

// File filter function
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Check MIME type
  if (!file.mimetype.startsWith('image/')) {
    return cb(new BadRequestError('Only image files are allowed'));
  }

  // Check file extension
  const fileExtension = file.originalname.split('.').pop()?.toLowerCase();
  if (!fileExtension || !MEDIA_CONFIG.ALLOWED_FORMATS.includes(fileExtension)) {
    return cb(new BadRequestError(`Invalid file format. Allowed: ${MEDIA_CONFIG.ALLOWED_FORMATS.join(', ')}`));
  }

  cb(null, true);
};

// Create multer instance
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MEDIA_CONFIG.MAX_IMAGE_SIZE,
    files: MEDIA_CONFIG.MAX_IMAGES_PER_MESSAGE,
  },
});

// Middleware for single image upload
export const uploadSingleImage = upload.single('image');

// Middleware for multiple image upload
export const uploadMultipleImages = upload.array('images', MEDIA_CONFIG.MAX_IMAGES_PER_MESSAGE);

// Error handler for multer errors
export const handleUploadError = (error: any, req: Request, res: any, next: any) => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          message: `File size exceeds ${MEDIA_CONFIG.MAX_IMAGE_SIZE / (1024 * 1024)}MB limit`,
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: `Maximum ${MEDIA_CONFIG.MAX_IMAGES_PER_MESSAGE} images allowed`,
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: 'Unexpected file field',
        });
      default:
        return res.status(400).json({
          success: false,
          message: 'File upload error',
        });
    }
  }
  next(error);
};