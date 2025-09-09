import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import sharp from 'sharp'
import tmp from 'tmp'
import fs from 'fs'
import path from 'path'

// Set ffmpeg path to use the static binary
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic)
}

export const generateVideoThumbnail = async (videoBuffer: Buffer): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const inputFile = tmp.fileSync({ postfix: '.mp4' })
    const outputFile = tmp.fileSync({ postfix: '.png' })
    
    try {
      // Write video buffer to temp file
      fs.writeFileSync(inputFile.fd, videoBuffer)
      
      // Extract first frame using FFmpeg at 0.1 seconds
      ffmpeg(inputFile.name)
        .screenshots({
          timestamps: [0.1], // Extract frame at 0.1 seconds as specified
          filename: path.basename(outputFile.name),
          folder: path.dirname(outputFile.name),
          size: '320x320' // Generate larger than needed, then resize with Sharp
        })
        .on('end', async () => {
          try {
            // Process with Sharp to match existing image processing pipeline
            // Resize to 160x160 to match existing small thumbnail size
            const thumbnailBuffer = await sharp(outputFile.name)
              .resize(160, 160, { fit: 'cover' })
              .webp({ quality: 95 }) // Match existing image quality settings
              .toBuffer()
            
            resolve(thumbnailBuffer)
          } catch (error) {
            reject(new Error(`Sharp processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`))
          } finally {
            // Cleanup temp files
            try {
              inputFile.removeCallback()
              outputFile.removeCallback()
            } catch (cleanupError) {
              console.warn('Failed to cleanup temp files:', cleanupError)
            }
          }
        })
        .on('error', (error) => {
          // Cleanup temp files on error
          try {
            inputFile.removeCallback()
            outputFile.removeCallback()
          } catch (cleanupError) {
            console.warn('Failed to cleanup temp files after error:', cleanupError)
          }
          reject(new Error(`FFmpeg thumbnail generation failed: ${error.message}`))
        })
    } catch (error) {
      // Cleanup temp files if initial setup fails
      try {
        inputFile.removeCallback()
        outputFile.removeCallback()
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp files after setup error:', cleanupError)
      }
      reject(new Error(`Video thumbnail setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`))
    }
  })
}

export const shouldGenerateThumbnail = (mimetype: string): boolean => {
  return mimetype.startsWith('video/')
}