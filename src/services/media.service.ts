import {
  deleteFromS3,
  getS3PublicUrl,
  isS3Configured,
  MEDIA_CONFIG,
  uploadToS3,
} from '../config/storage';
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
  private readonly variantNames = [
    'original',
    'thumbnail',
    'small',
    'medium',
    'large',
  ] as const;

  /**
   * Validate multiple images before upload
   */
  validateImages(files: Express.Multer.File[]): MediaValidationResult {
    const errors: string[] = [];
    let totalSize = 0;

    // Check number of images
    if (files.length > MEDIA_CONFIG.MAX_IMAGES_PER_MESSAGE) {
      errors.push(
        `Maximum ${MEDIA_CONFIG.MAX_IMAGES_PER_MESSAGE} images allowed per message`
      );
    }

    // Check each file
    files.forEach((file, index) => {
      totalSize += file.size;

      // Check file size
      if (file.size > MEDIA_CONFIG.MAX_IMAGE_SIZE) {
        errors.push(
          `Image ${index + 1}: Size exceeds ${MEDIA_CONFIG.MAX_IMAGE_SIZE / (1024 * 1024)}MB limit`
        );
      }

      // Check file type
      const fileExtension = file.originalname.split('.').pop()?.toLowerCase();
      if (
        !fileExtension ||
        !MEDIA_CONFIG.ALLOWED_FORMATS.includes(fileExtension)
      ) {
        errors.push(
          `Image ${index + 1}: Invalid format. Allowed: ${MEDIA_CONFIG.ALLOWED_FORMATS.join(', ')}`
        );
      }

      // Check MIME type
      if (!file.mimetype.startsWith('image/')) {
        errors.push(`Image ${index + 1}: Invalid MIME type. Must be an image.`);
      }
    });

    // Check total upload size
    if (totalSize > MEDIA_CONFIG.MAX_TOTAL_UPLOAD) {
      errors.push(
        `Total upload size exceeds ${MEDIA_CONFIG.MAX_TOTAL_UPLOAD / (1024 * 1024)}MB limit`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      totalSize,
    };
  }

  /**
   * Normalize images into a consistent WebP payload before upload
   */
  async compressImage(buffer: Buffer, originalSize: number): Promise<Buffer> {
    try {
      const compressed = await sharp(buffer)
        .resize(1200, 1200, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({
          quality: originalSize <= MEDIA_CONFIG.COMPRESSED_SIZE ? 85 : 80,
        })
        .toBuffer();

      logger.info(
        `Image compressed: ${originalSize} bytes → ${compressed.length} bytes`
      );
      return compressed;
    } catch (error) {
      logger.error('Image compression failed:', error);
      throw new BadRequestError('Failed to process image');
    }
  }

  private buildVariantKeys(publicId: string) {
    return {
      original: `${publicId}/original.webp`,
      thumbnail: `${publicId}/thumbnail.webp`,
      small: `${publicId}/small.webp`,
      medium: `${publicId}/medium.webp`,
      large: `${publicId}/large.webp`,
    };
  }

  private async createVariants(processedBuffer: Buffer) {
    const originalMetadata = await sharp(processedBuffer).metadata();

    return {
      original: {
        buffer: processedBuffer,
        width: originalMetadata.width || 0,
        height: originalMetadata.height || 0,
      },
      thumbnail: {
        buffer: await sharp(processedBuffer)
          .resize(150, 150, { fit: 'cover' })
          .webp({ quality: 75 })
          .toBuffer(),
      },
      small: {
        buffer: await sharp(processedBuffer)
          .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 78 })
          .toBuffer(),
      },
      medium: {
        buffer: await sharp(processedBuffer)
          .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer(),
      },
      large: {
        buffer: await sharp(processedBuffer)
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer(),
      },
    };
  }

  /**
   * Upload single image to S3
   */
  async uploadImage(
    file: Express.Multer.File,
    userId: string
  ): Promise<MediaUploadResult> {
    if (!isS3Configured) {
      throw new BadRequestError('Media storage is not configured');
    }

    try {
      // Compress image if needed
      const processedBuffer = await this.compressImage(file.buffer, file.size);
      const publicId = `${MEDIA_CONFIG.FOLDER}/${userId}/${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 11)}`;
      const keys = this.buildVariantKeys(publicId);
      const variants = await this.createVariants(processedBuffer);

      try {
        await Promise.all([
          uploadToS3(keys.original, variants.original.buffer, 'image/webp'),
          uploadToS3(keys.thumbnail, variants.thumbnail.buffer, 'image/webp'),
          uploadToS3(keys.small, variants.small.buffer, 'image/webp'),
          uploadToS3(keys.medium, variants.medium.buffer, 'image/webp'),
          uploadToS3(keys.large, variants.large.buffer, 'image/webp'),
        ]);
      } catch (uploadError) {
        await Promise.allSettled(
          this.variantNames.map(variant => deleteFromS3(keys[variant]))
        );
        throw uploadError;
      }

      logger.info(`Image uploaded to S3: ${publicId}`);

      return {
        publicId,
        url: getS3PublicUrl(keys.original),
        secureUrl: getS3PublicUrl(keys.original),
        width: variants.original.width,
        height: variants.original.height,
        format: 'webp',
        bytes: variants.original.buffer.length,
        originalFilename: file.originalname,
      };
    } catch (error) {
      logger.error('S3 upload failed:', error);
      throw new BadRequestError('Failed to upload image');
    }
  }

  /**
   * Upload multiple images
   */
  async uploadImages(
    files: Express.Multer.File[],
    userId: string
  ): Promise<MediaUploadResult[]> {
    // Validate all images first
    const validation = this.validateImages(files);
    if (!validation.isValid) {
      throw new BadRequestError(
        `Image validation failed: ${validation.errors.join(', ')}`
      );
    }

    // Upload all images
    try {
      const settledResults = await Promise.allSettled(
        files.map(file => this.uploadImage(file, userId))
      );
      const failedResult = settledResults.find(
        result => result.status === 'rejected'
      );

      if (failedResult) {
        const uploadedPublicIds = settledResults
          .filter(
            (result): result is PromiseFulfilledResult<MediaUploadResult> =>
              result.status === 'fulfilled'
          )
          .map(result => result.value.publicId);

        if (uploadedPublicIds.length > 0) {
          await this.deleteImages(uploadedPublicIds);
        }

        throw failedResult.reason;
      }

      const results = settledResults.map(
        result => (result as PromiseFulfilledResult<MediaUploadResult>).value
      );
      logger.info(
        `Successfully uploaded ${results.length} images for user ${userId}`
      );
      return results;
    } catch (error) {
      logger.error('Batch image upload failed:', error);
      throw new BadRequestError('Failed to upload one or more images');
    }
  }

  /**
   * Delete image variants from S3
   */
  async deleteImage(publicId: string): Promise<void> {
    const keys = this.buildVariantKeys(publicId);

    try {
      await Promise.all(
        this.variantNames.map(variant => deleteFromS3(keys[variant]))
      );
      logger.info(`Image deleted from S3: ${publicId}`);
    } catch (error) {
      logger.error(`Error deleting image from S3: ${publicId}`, error);
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
    const keys = this.buildVariantKeys(publicId);

    return {
      thumbnail: getS3PublicUrl(keys.thumbnail),
      small: getS3PublicUrl(keys.small),
      medium: getS3PublicUrl(keys.medium),
      large: getS3PublicUrl(keys.large),
      original: getS3PublicUrl(keys.original),
    };
  }
}

export const mediaService = new MediaService();
