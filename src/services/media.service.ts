import { cloudinary, MEDIA_CONFIG, CLOUDINARY_UPLOAD_OPTIONS } from '../config/cloudinary';
import { BadRequestError, logger } from '../utils';
import sharp from 'sharp';

export interface MediaUploadResult {
  publicId: string;
  url: string;
  secureUrl: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  originalFilename?: string;
}

export interface MediaValidationResult {
  isValid: boolean;
  errors: string[];
  totalSize: number;
}

export class MediaService {
  /**
   * Validate multiple images before upload
   */
  validateImages(files: Express.Multer.File[]): MediaValidationResult {
    const errors: string[] = [];
    let totalSize = 0;

    // Check number of images
    if (files.length > MEDIA_CONFIG.MAX_IMAGES_PER_MESSAGE) {
      errors.push(`Maximum ${MEDIA_CONFIG.MAX_IMAGES_PER_MESSAGE} images allowed per message`);
    }

    // Check each file
    files.forEach((file, index) => {
      totalSize += file.size;

      // Check file size
      if (file.size > MEDIA_CONFIG.MAX_IMAGE_SIZE) {
        errors.push(`Image ${index + 1}: Size exceeds ${MEDIA_CONFIG.MAX_IMAGE_SIZE / (1024 * 1024)}MB limit`);
      }

      // Check file type
      const fileExtension = file.originalname.split('.').pop()?.toLowerCase();
      if (!fileExtension || !MEDIA_CONFIG.ALLOWED_FORMATS.includes(fileExtension)) {
        errors.push(`Image ${index + 1}: Invalid format. Allowed: ${MEDIA_CONFIG.ALLOWED_FORMATS.join(', ')}`);
      }

      // Check MIME type
      if (!file.mimetype.startsWith('image/')) {
        errors.push(`Image ${index + 1}: Invalid MIME type. Must be an image.`);
      }
    });

    // Check total upload size
    if (totalSize > MEDIA_CONFIG.MAX_TOTAL_UPLOAD) {
      errors.push(`Total upload size exceeds ${MEDIA_CONFIG.MAX_TOTAL_UPLOAD / (1024 * 1024)}MB limit`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      totalSize,
    };
  }

  /**
   * Compress image if needed
   */
  async compressImage(buffer: Buffer, originalSize: number): Promise<Buffer> {
    // If already under compressed size limit, return as-is
    if (originalSize <= MEDIA_CONFIG.COMPRESSED_SIZE) {
      return buffer;
    }

    try {
      // Compress using Sharp
      const compressed = await sharp(buffer)
        .webp({ quality: 80 })
        .resize(1200, 1200, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .toBuffer();

      logger.info(`Image compressed: ${originalSize} bytes → ${compressed.length} bytes`);
      return compressed;
    } catch (error) {
      logger.error('Image compression failed:', error);
      throw new BadRequestError('Failed to process image');
    }
  }

  /**
   * Upload single image to Cloudinary
   */
  async uploadImage(file: Express.Multer.File, userId: string): Promise<MediaUploadResult> {
    try {
      // Compress image if needed
      const processedBuffer = await this.compressImage(file.buffer, file.size);

      // Upload to Cloudinary
      const result = await new Promise<any>((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            ...CLOUDINARY_UPLOAD_OPTIONS,
            public_id: `${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            context: {
              user_id: userId,
              upload_date: new Date().toISOString(),
            },
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(processedBuffer);
      });

      logger.info(`Image uploaded to Cloudinary: ${result.public_id}`);

      return {
        publicId: result.public_id,
        url: result.url,
        secureUrl: result.secure_url,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
        originalFilename: file.originalname,
      };
    } catch (error) {
      logger.error('Cloudinary upload failed:', error);
      throw new BadRequestError('Failed to upload image');
    }
  }

  /**
   * Upload multiple images
   */
  async uploadImages(files: Express.Multer.File[], userId: string): Promise<MediaUploadResult[]> {
    // Validate all images first
    const validation = this.validateImages(files);
    if (!validation.isValid) {
      throw new BadRequestError(`Image validation failed: ${validation.errors.join(', ')}`);
    }

    // Upload all images
    const uploadPromises = files.map(file => this.uploadImage(file, userId));
    
    try {
      const results = await Promise.all(uploadPromises);
      logger.info(`Successfully uploaded ${results.length} images for user ${userId}`);
      return results;
    } catch (error) {
      logger.error('Batch image upload failed:', error);
      throw new BadRequestError('Failed to upload one or more images');
    }
  }

  /**
   * Delete image from Cloudinary
   */
  async deleteImage(publicId: string): Promise<void> {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      if (result.result === 'ok') {
        logger.info(`Image deleted from Cloudinary: ${publicId}`);
      } else {
        logger.warn(`Failed to delete image from Cloudinary: ${publicId}, result: ${result.result}`);
      }
    } catch (error) {
      logger.error(`Error deleting image from Cloudinary: ${publicId}`, error);
      // Don't throw error - deletion failure shouldn't break the flow
    }
  }

  /**
   * Delete multiple images
   */
  async deleteImages(publicIds: string[]): Promise<void> {
    const deletePromises = publicIds.map(id => this.deleteImage(id));
    await Promise.allSettled(deletePromises);
  }

  /**
   * Generate optimized image URLs for different sizes
   */
  generateImageUrls(publicId: string) {
    const baseUrl = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`;
    
    return {
      thumbnail: `${baseUrl}/w_150,h_150,c_fill,f_webp,q_auto/${publicId}`,
      small: `${baseUrl}/w_300,h_300,c_limit,f_webp,q_auto/${publicId}`,
      medium: `${baseUrl}/w_600,h_600,c_limit,f_webp,q_auto/${publicId}`,
      large: `${baseUrl}/w_1200,h_1200,c_limit,f_webp,q_auto/${publicId}`,
      original: `${baseUrl}/${publicId}`,
    };
  }
}

export const mediaService = new MediaService();