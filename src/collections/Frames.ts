import type { CollectionConfig } from 'payload'
import { getStorageConfig } from '@/lib/storage'
import sharp from 'sharp'
import ffmpeg from 'fluent-ffmpeg'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import { tmpdir } from 'os'

const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024 // 100MB
const MAX_VIDEO_DURATION = 30 // 30 seconds

// Helper function to extract video duration
const getVideoDuration = (filePath: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err)
        return
      }
      
      const duration = metadata.format.duration
      if (typeof duration === 'number') {
        resolve(duration)
      } else {
        reject(new Error('Could not extract video duration'))
      }
    })
  })
}

// Helper function to convert MP4 to WEBM
const convertMp4ToWebm = (inputPath: string, outputPath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .output(outputPath)
      .videoCodec('libvpx-vp9')
      .audioCodec('libvorbis')
      .videoBitrate('1000k')
      .audioFrequency(44100)
      .audioChannels(2)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
}

export const Frames: CollectionConfig = {
  slug: 'frames',
  upload: {
    staticDir: 'media/frames',
    mimeTypes: [
      // Images
      'image/jpeg',
      'image/jpg', 
      'image/webp',
      // Videos
      'video/mp4',
      'video/webm',
    ],
    ...getStorageConfig(),
  },
  admin: {
    useAsTitle: 'name',
  },
  hooks: {
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        // Generate slug from name
        if (operation === 'create' && data.name) {
          data.slug = data.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
        } else if (operation === 'update' && originalDoc) {
          data.slug = originalDoc.slug
        }

        // File processing and validation
        if (req.file) {
          const { mimetype, size, buffer } = req.file
          
          // File size validation
          if (mimetype.startsWith('image/')) {
            if (size > MAX_IMAGE_SIZE) {
              throw new Error(`Image file size (${(size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size of 10MB`)
            }
            
            // Process image: Extract dimensions and convert JPEG to WEBP
            try {
              const imageBuffer = buffer || req.file.data
              const metadata = await sharp(imageBuffer).metadata()
              
              data.dimensions = {
                width: metadata.width,
                height: metadata.height,
              }
              
              // Convert JPEG to WEBP at 95% quality
              if (mimetype === 'image/jpeg' || mimetype === 'image/jpg') {
                const webpBuffer = await sharp(imageBuffer)
                  .webp({ quality: 95 })
                  .toBuffer()
                
                // Update the file data
                req.file.buffer = webpBuffer
                req.file.mimetype = 'image/webp'
                req.file.originalname = req.file.originalname.replace(/\.(jpe?g)$/i, '.webp')
              }
            } catch (error) {
              throw new Error(`Error processing image: ${error.message}`)
            }
          } else if (mimetype.startsWith('video/')) {
            if (size > MAX_VIDEO_SIZE) {
              throw new Error(`Video file size (${(size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size of 100MB`)
            }
            
            // Process video: Extract duration and convert MP4 to WEBM
            try {
              const videoBuffer = buffer || req.file.data
              
              // Write buffer to temporary file for ffmpeg processing
              const tmpInputPath = path.join(tmpdir(), `frame_input_${Date.now()}.${mimetype.split('/')[1]}`)
              const tmpOutputPath = path.join(tmpdir(), `frame_output_${Date.now()}.webm`)
              
              fs.writeFileSync(tmpInputPath, videoBuffer)
              
              try {
                // Extract duration
                const duration = await getVideoDuration(tmpInputPath)
                
                // Validate duration
                if (duration > MAX_VIDEO_DURATION) {
                  throw new Error(`Video duration (${duration.toFixed(2)}s) exceeds maximum allowed duration of ${MAX_VIDEO_DURATION}s`)
                }
                
                data.duration = Math.round(duration * 100) / 100 // Round to 2 decimal places
                
                // Convert MP4 to WEBM
                if (mimetype === 'video/mp4') {
                  await convertMp4ToWebm(tmpInputPath, tmpOutputPath)
                  
                  // Read the converted file
                  const webmBuffer = fs.readFileSync(tmpOutputPath)
                  
                  // Update the file data
                  req.file.buffer = webmBuffer
                  req.file.mimetype = 'video/webm'
                  req.file.originalname = req.file.originalname.replace(/\.mp4$/i, '.webm')
                  
                  // Clean up temporary output file
                  fs.unlinkSync(tmpOutputPath)
                }
              } finally {
                // Clean up temporary input file
                fs.unlinkSync(tmpInputPath)
              }
            } catch (error) {
              throw new Error(`Error processing video: ${error.message}`)
            }
          }
        }

        return data
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'imageSet',
      type: 'select',
      options: ['male', 'female'],
      required: true,
      admin: {
        description: 'Whether this frame is for male or female meditation poses',
      },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
    },
    {
      name: 'dimensions',
      type: 'json',
      admin: {
        description: 'Auto-populated dimensions for images (width/height)',
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'duration',
      type: 'number',
      admin: {
        description: 'Auto-populated duration for videos (in seconds)',
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
}