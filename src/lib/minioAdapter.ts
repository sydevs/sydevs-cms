/**
 * MinIO S3-compatible storage configuration for Payload CMS
 */
import { s3Storage } from '@payloadcms/storage-s3'

/**
 * Create MinIO storage configuration for S3-compatible storage
 * Automatically configures based on environment variables
 */
export const createMinIOStorage = () => {
  // Check if MinIO configuration is available
  const endpoint = process.env.S3_ENDPOINT
  const accessKeyId = process.env.S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
  const bucketName = process.env.S3_BUCKET_NAME

  // If MinIO configuration is not available, return null to use local storage
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
    return null
  }

  return s3Storage({
    collections: {
      media: true,
      music: true,
      frames: true,
      meditations: true,
    },
    bucket: bucketName,
    config: {
      endpoint,
      region: process.env.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      // Critical for MinIO compatibility
      forcePathStyle: true,
    },
  })
}

/**
 * Check if MinIO is configured and available
 */
export const isMinIOConfigured = (): boolean => {
  return !!(
    process.env.S3_ENDPOINT &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY &&
    process.env.S3_BUCKET_NAME
  )
}