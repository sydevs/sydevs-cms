import type { CollectionConfig, Validate } from 'payload'

export const MeditationFrames: CollectionConfig = {
  slug: 'meditationFrames',
  admin: {
    hidden: true, // Hide from admin panel navigation
    useAsTitle: 'id', // Use the auto-generated ID as the title
  },
  hooks: {
    beforeChange: [
      async ({ data, req, originalDoc }) => {
        // Validate timestamp uniqueness per meditation
        if (data.meditation && typeof data.timestamp === 'number') {
          try {
            // Note: Duplicate frame validation disabled for flexibility
            // In practice, the frames array validation in Meditations collection handles this

            // Check for existing meditation-frame relationships with the same timestamp
            const existingFrames = await req.payload.find({
              collection: 'meditationFrames',
              where: {
                and: [
                  {
                    meditation: {
                      equals: data.meditation,
                    },
                  },
                  {
                    timestamp: {
                      equals: data.timestamp,
                    },
                  },
                ],
              },
              limit: 1,
            })

            // If we're updating an existing record, exclude it from the uniqueness check
            const conflictingFrames = originalDoc
              ? existingFrames.docs.filter(doc => doc.id !== originalDoc.id)
              : existingFrames.docs

            if (conflictingFrames.length > 0) {
              throw new Error(`Timestamp ${data.timestamp} seconds is already used in this meditation. Each timestamp must be unique per meditation.`)
            }
          } catch (error) {
            req.payload.logger.error({
              msg: 'Error during meditation frame validation',
              err: error,
              timestamp: data.timestamp,
              meditationId: data.meditation,
              frameId: data.frame,
              operation: originalDoc ? 'update' : 'create',
            })
            throw error
          }
        }
        
        return data
      },
    ],
  },
  fields: [
    {
      name: 'meditation',
      type: 'relationship',
      relationTo: 'meditations',
      required: true,
      index: true, // Index for performance on queries
    },
    {
      name: 'frame',
      type: 'relationship',
      relationTo: 'frames',
      required: true,
      index: true, // Index for performance on queries
    },
    {
      name: 'timestamp',
      type: 'number',
      min: 0,
      required: true,
      index: true, // Add index for better query performance when sorting
      admin: {
        description: 'Timestamp in seconds - used for ordering frames within a meditation',
      },
      validate: (value) => {
        // Basic type validation only for now - we'll handle uniqueness at collection level
        if (typeof value !== 'number' || value < 0 || isNaN(value)) {
          return 'Timestamp must be a valid number greater than or equal to 0'
        }
        
        return true
      },
    },
  ],
}