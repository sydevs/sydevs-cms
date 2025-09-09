import {
  CollectionBeforeChangeHook,
  CollectionBeforeOperationHook,
  CollectionBeforeValidateHook,
} from 'payload'
import { PayloadRequest } from 'payload'
import sharp from 'sharp'
import slugify from 'slugify'
import { extractFileMetadata } from './fileUtils'
import { generateVideoThumbnail, shouldGenerateThumbnail } from './videoThumbnailUtils'

type FileType = 'image' | 'audio' | 'video'

// Maximum MBs for different file types
const MAX_FILE_SIZE = {
  image: 10,
  audio: 50,
  video: 100,
}

// Maximum seconds for different file types
const MAX_FILE_DURATION = {
  image: Infinity, // not applicable
  audio: 50,
  video: 62,
}

type ProcessFileHook = ({
  maxMB,
  maxMinutes,
}: {
  maxMB?: number
  maxMinutes?: number
}) => CollectionBeforeValidateHook

export const sanitizeFilename: CollectionBeforeOperationHook = async ({
  req,
}: {
  req: PayloadRequest
}) => {
  const file = req.file
  if (typeof file?.name === 'string') {
    const fileName = file.name.split('.', 2)

    file.name =
      slugify(fileName[0], { strict: true, lower: true }) +
      '-' +
      (Math.random() + 1).toString(36).substring(2) +
      '.' +
      fileName[1]
  }
}

export const processFile: ProcessFileHook = ({ maxMB, maxMinutes }) => {
  return async ({ data, req }) => {
    if (!req.file || !req.file.data) {
      return data
    }

    const { mimetype } = req.file
    const fileType = mimetype.split('/', 1)[0] as FileType
    maxMB ||= MAX_FILE_SIZE[fileType]
    maxMinutes ||= MAX_FILE_DURATION[fileType]

    // Validate file size
    const fileSize = req.file.size / 1024 / 1024 || 0
    if (req.file.size > maxMB * 1024 * 1024) {
      throw new Error(
        `File size (${(fileSize / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size of ${maxMB}MB`,
      )
    }

    // Extract meta data
    const metadata = await extractFileMetadata(req.file)
    data ||= {}
    data.fileMetadata = metadata

    // Validate duration
    if (metadata && maxMinutes !== Infinity) {
      const duration = metadata.duration || 0
      const maxSeconds = maxMinutes * 60

      if (duration > maxSeconds) {
        throw new Error(
          `Duration (${Math.round(duration / 60)} minutes) exceeds maximum allowed duration of ${maxMinutes} minutes`,
        )
      }
    }

    return data
  }
}

export const convertFile: CollectionBeforeChangeHook = async ({ data, req }) => {
  if (req.file && req.file.data && req.file.mimetype) {
    const { mimetype } = req.file

    if (mimetype.startsWith('image/')) {
      // For images, extract dimensions using Sharp
      const { width, height } = await sharp(req.file.data).metadata()
      if (width && height) {
        data.dimensions = { width, height }
      }

      // Auto-convert JPG to WEBP at 95% quality (similar to Media collection)
      if (mimetype === 'image/jpeg' || mimetype === 'image/png') {
        const webpBuffer = await sharp(req.file.data).webp({ quality: 95 }).toBuffer()

        // Update the file data
        req.file.data = webpBuffer
        req.file.mimetype = 'image/webp'
        req.file.name = req.file.name.replace(/\.(jpe?g|png)$/i, '.webp')
      }
    } else if (mimetype.startsWith('video/')) {
      // Generate thumbnail for video files
      if (shouldGenerateThumbnail(mimetype)) {
        try {
          const thumbnailBuffer = await generateVideoThumbnail(req.file.data)
          
          // Get metadata for the thumbnail image
          const { width, height } = await sharp(thumbnailBuffer).metadata()
          
          // Create a sizes object similar to how Payload handles image sizes
          // This stores the thumbnail as part of the same document
          data.sizes = data.sizes || {}
          
          // Add the thumbnail to the sizes object
          // This matches the structure that Payload uses for image sizes
          data.sizes.small = {
            filename: req.file.name.replace(/\.[^.]+$/, '-small.webp'),
            mimeType: 'image/webp',
            filesize: thumbnailBuffer.length,
            width: width || 160,
            height: height || 160,
            url: null, // Will be set by Payload
          }
          
          // Store the thumbnail buffer in a way that Payload can process it
          // We'll need to write this file to disk in the same directory as the video
          if (req.payload) {
            const fs = await import('fs')
            const path = await import('path')
            
            // Determine the upload directory based on collection configuration
            const uploadDir = path.join(process.cwd(), 'frames')
            const thumbnailPath = path.join(uploadDir, data.sizes.small.filename)
            
            // Ensure directory exists
            if (!fs.existsSync(uploadDir)) {
              fs.mkdirSync(uploadDir, { recursive: true })
            }
            
            // Write thumbnail file to disk
            fs.writeFileSync(thumbnailPath, thumbnailBuffer)
            
            // Set the URL for the thumbnail
            data.sizes.small.url = `/api/frames/file/${data.sizes.small.filename}`
          }
        } catch (error) {
          console.warn('Failed to generate video thumbnail:', error instanceof Error ? error.message : 'Unknown error')
          // Continue without thumbnail - component will fall back to video display
        }
      }
      
      // TODO: Video conversion to WEBM would go here in the future
      // For now, we'll keep the original format
    }
  }

  return data
}

export const generateSlug: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
}) => {
  // Generate slug from title
  if (operation === 'create' && data.title && !data.slug) {
    data.slug = slugify(data.title, { strict: true, lower: true })
  } else if (operation === 'update' && originalDoc) {
    data.slug = originalDoc.slug
  }

  return data
}
