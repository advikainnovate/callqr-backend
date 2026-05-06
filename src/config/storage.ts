import {
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import axios from 'axios';

export const MEDIA_CONFIG = {
  MAX_IMAGES_PER_MESSAGE: 5,
  MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
  COMPRESSED_SIZE: 2 * 1024 * 1024, // 2MB target
  MAX_TOTAL_UPLOAD: 10 * 1024 * 1024, // 10MB total per message
  ALLOWED_FORMATS: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  FOLDER: 'callqr/messages',
};

const s3Region = process.env.AWS_REGION || '';
const s3BucketName = process.env.S3_BUCKET_NAME || '';
const s3AccessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
const s3SecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
const s3Endpoint = process.env.S3_ENDPOINT || '';
const s3PublicBaseUrl = process.env.S3_PUBLIC_BASE_URL || '';
const s3ForcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';

export const isS3Configured = Boolean(
  s3Region && s3BucketName && s3AccessKeyId && s3SecretAccessKey
);

export const s3Bucket = s3BucketName;

export const s3Client = isS3Configured
  ? new S3Client({
      region: s3Region,
      credentials: {
        accessKeyId: s3AccessKeyId,
        secretAccessKey: s3SecretAccessKey,
      },
      endpoint: s3Endpoint || undefined,
      forcePathStyle: s3ForcePathStyle,
    })
  : null;

const normalizedPublicBaseUrl = (() => {
  if (s3PublicBaseUrl) {
    return s3PublicBaseUrl.replace(/\/+$/, '');
  }

  if (s3Endpoint) {
    return `${s3Endpoint.replace(/\/+$/, '')}/${s3BucketName}`;
  }

  if (!s3BucketName || !s3Region) {
    return '';
  }

  return `https://${s3BucketName}.s3.${s3Region}.amazonaws.com`;
})();

export const getS3PublicUrl = (key: string): string => {
  return `${normalizedPublicBaseUrl}/${key}`;
};

export const uploadToS3 = async (
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> => {
  if (!s3Client || !s3Bucket) {
    throw new Error('S3 storage is not configured');
  }

  await s3Client.send(
    new PutObjectCommand({
      Bucket: s3Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
};

export const deleteFromS3 = async (key: string): Promise<void> => {
  if (!s3Client || !s3Bucket) {
    return;
  }

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: s3Bucket,
      Key: key,
    })
  );
};

export const checkS3Health = async (): Promise<{
  status: 'connected' | 'warning' | 'error';
  details: string;
}> => {
  if (!isS3Configured || !s3Client || !s3Bucket) {
    return {
      status: 'warning',
      details: 'S3 credentials not configured (media uploads disabled)',
    };
  }

  try {
    await s3Client.send(
      new HeadBucketCommand({
        Bucket: s3Bucket,
      })
    );

    const healthcheckKey = `${MEDIA_CONFIG.FOLDER}/healthcheck/${Date.now()}.txt`;
    await uploadToS3(healthcheckKey, Buffer.from('ok'), 'text/plain');

    try {
      const publicUrl = getS3PublicUrl(healthcheckKey);
      const response = await axios.get(publicUrl, {
        responseType: 'text',
        timeout: 5000,
        validateStatus: () => true,
      });

      if (response.status < 200 || response.status >= 300) {
        return {
          status: 'error',
          details: `S3 bucket reachable but public media URL is not accessible (HTTP ${response.status}). Check bucket/CDN public-read configuration.`,
        };
      }
    } finally {
      await deleteFromS3(healthcheckKey);
    }

    return {
      status: 'connected',
      details: `S3 bucket reachable and public media URLs are accessible (${s3Bucket})`,
    };
  } catch (error) {
    return {
      status: 'error',
      details: `S3 connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};
