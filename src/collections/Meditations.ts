import type { CollectionConfig, Validate } from 'payload'
import { getAudioDuration, validateAudioDuration, validateAudioFileSize } from '@/lib/audioUtils'
import { getStorageConfig } from '@/lib/storage'

export const Meditations: CollectionConfig = {
  slug: 'meditations',
  upload: {
    staticDir: 'media/meditations',
    mimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/aac', 'audio/ogg'],
    ...getStorageConfig(),
  },
  admin: {
    useAsTitle: 'title',
  },
  hooks: {
    beforeChange: [
      ({ data, operation, originalDoc }) => {
        // Generate slug from title
        if (operation === 'create' && data.title) {
          // Always generate slug on create, ignore any provided slug
          data.slug = data.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
        } else if (operation === 'update' && originalDoc) {
          // Preserve original slug on update
          data.slug = originalDoc.slug
        }
        return data
      },
      async ({ data, req }) => {
        // Audio file validation and duration extraction
        if (req.file && req.file.data) {
          try {
            // Validate file size (50MB limit)
            const fileSizeValidation = validateAudioFileSize(req.file.size || 0, 50)
            if (fileSizeValidation !== true) {
              throw new Error(fileSizeValidation)
            }

            // Extract and validate audio duration
            const duration = await getAudioDuration(req.file.data)
            const durationValidation = validateAudioDuration(duration, 15) // 15 minutes max
            if (durationValidation !== true) {
              throw new Error(durationValidation)
            }

            // Auto-populate duration in seconds
            data.duration = Math.round(duration) // Round to nearest second
          } catch (error) {
            req.payload.logger.error({
              msg: 'Audio file validation failed',
              err: error,
              fileName: req.file.name,
              fileSize: req.file.size,
            })
            throw error
          }
        }
        
        return data
      },
    ],
    afterChange: [
      async ({ doc, req, previousDoc }) => {
        // Sync frame relationships with MeditationFrames collection
        if (doc.frames && Array.isArray(doc.frames)) {
          try {
            // Get existing frame relationships
            const existingRelationships = await req.payload.find({
              collection: 'meditationFrames',
              where: {
                meditation: {
                  equals: doc.id,
                },
              },
              limit: 1000, // Should be sufficient for most cases
            })

            // Create maps for easier comparison
            const existingMap = new Map(
              existingRelationships.docs.map(rel => [
                `${rel.frame}-${rel.timestamp}`,
                rel.id
              ])
            )

            const newMap = new Map(
              doc.frames
                .filter(f => f.frame && typeof f.timestamp === 'number')
                .map(f => [`${f.frame}-${f.timestamp}`, f])
            )

            // Determine operations needed
            const toDelete: string[] = []
            const toCreate: Array<{ frame: string; timestamp: number }> = []

            // Find relationships to delete
            for (const [key, id] of existingMap) {
              if (!newMap.has(key)) {
                toDelete.push(id)
              }
            }

            // Find relationships to create
            for (const [key, frameData] of newMap) {
              if (!existingMap.has(key)) {
                toCreate.push({
                  frame: frameData.frame,
                  timestamp: frameData.timestamp,
                })
              }
            }

            // Perform deletions
            if (toDelete.length > 0) {
              await req.payload.delete({
                collection: 'meditationFrames',
                where: {
                  id: {
                    in: toDelete,
                  },
                },
              })
            }

            // Perform creations
            for (const frameData of toCreate) {
              await req.payload.create({
                collection: 'meditationFrames',
                data: {
                  meditation: doc.id,
                  frame: frameData.frame,
                  timestamp: frameData.timestamp,
                },
              })
            }

            req.payload.logger.info({
              msg: 'Successfully synced meditation frame relationships',
              meditationId: doc.id,
              meditationTitle: doc.title,
              created: toCreate.length,
              deleted: toDelete.length,
              total: doc.frames.length,
            })
          } catch (error) {
            req.payload.logger.error({
              msg: 'Failed to sync meditation frame relationships',
              err: error,
              meditationId: doc.id,
              meditationTitle: doc.title,
              framesCount: doc.frames?.length || 0,
            })
            // Re-throw to prevent silent failures
            throw error
          }
        } else if (previousDoc?.frames && (!doc.frames || doc.frames.length === 0)) {
          // Handle case where all frames were removed
          try {
            await req.payload.delete({
              collection: 'meditationFrames',
              where: {
                meditation: {
                  equals: doc.id,
                },
              },
            })
            
            req.payload.logger.info({
              msg: 'Cleared all meditation frame relationships',
              meditationId: doc.id,
              meditationTitle: doc.title,
            })
          } catch (error) {
            req.payload.logger.error({
              msg: 'Failed to clear meditation frame relationships',
              err: error,
              meditationId: doc.id,
              meditationTitle: doc.title,
            })
            throw error
          }
        }
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        try {
          await req.payload.delete({
            collection: 'meditationFrames',
            where: {
              meditation: {
                equals: doc.id,
              },
            },
          })
        } catch (error) {
          req.payload.logger.error({
            msg: 'Failed to cleanup meditation frame relationships on deletion',
            err: error,
            meditationId: doc.id,
            meditationTitle: doc.title,
          })
          // Re-throw to prevent silent failures
          throw error
        }
      },
    ],
  },
  fields: [
    {
      name: 'title',
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
      name: 'thumbnail',
      type: 'upload',
      relationTo: 'media',
      required: true,
      validate: (async (value, { req }) => {
        if (!value) return true // Required validation handles this
        
        try {
          const media = await req.payload.findByID({
            collection: 'media',
            id: value,
          })
          
          if (!media.mimeType || !media.mimeType.startsWith('image/')) {
            return 'Thumbnail must be an image file'
          }
          
          return true
        } catch (_error) {
          return 'Invalid media file'
        }
      }) as Validate,
    },
    {
      name: 'duration',
      type: 'number',
      admin: {
        description: 'Duration in seconds',
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'narrator',
      type: 'relationship',
      relationTo: 'narrators',
      required: true,
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
    },
    {
      name: 'musicTag',
      type: 'relationship',
      relationTo: 'tags',
      admin: {
        description: 'Music with this tag will be offered to the seeker',
      },
    },
    {
      name: 'isPublished',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'publishedDate',
      type: 'date',
      admin: {
        position: 'sidebar',
        date: {
          pickerAppearance: 'dayOnly',
        },
      },
    },
    {
      name: 'frames',
      type: 'array',
      admin: {
        description: 'Frames associated with this meditation, ordered by timestamp',
      },
      fields: [
        {
          name: 'frame',
          type: 'relationship',
          relationTo: 'frames',
          required: true,
        },
        {
          name: 'timestamp',
          type: 'number',
          min: 0,
          required: true,
          admin: {
            description: 'Time in seconds when this frame should appear',
          },
        },
      ],
      validate: (value) => {
        if (!value || !Array.isArray(value)) return true
        
        // Check for duplicate timestamps
        const timestamps = value.map(item => item.timestamp).filter(t => typeof t === 'number')
        const uniqueTimestamps = new Set(timestamps)
        if (timestamps.length !== uniqueTimestamps.size) {
          return 'Each timestamp must be unique. Please ensure no two frames have the same timestamp.'
        }
        
        // Check for duplicate frames
        const frameIds = value.map(item => item.frame).filter(f => f)
        const uniqueFrameIds = new Set(frameIds)
        if (frameIds.length !== uniqueFrameIds.size) {
          return 'Each frame can only appear once in a meditation. Please remove duplicate frames.'
        }
        
        return true
      },
      hooks: {
        beforeChange: [
          ({ value }) => {
            if (!value || !Array.isArray(value)) return value
            
            // Sort frames by timestamp for consistent ordering
            return [...value].sort((a, b) => a.timestamp - b.timestamp)
          },
        ],
      },
    },
  ],
}