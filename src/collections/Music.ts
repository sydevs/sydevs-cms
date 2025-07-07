import type { CollectionConfig } from 'payload'

export const Music: CollectionConfig = {
  slug: 'music',
  upload: {
    staticDir: 'music',
    mimeTypes: ['audio/*'],
  },
  admin: {
    useAsTitle: 'title',
  },
  hooks: {
    beforeValidate: [
      ({ data, req }) => {
        // Validate file size (50MB = 52,428,800 bytes)
        if (req.file && req.file.size > 52428800) {
          throw new Error('File size must be less than 50MB')
        }

        // Validate audio mimeType
        if (req.file && !req.file.mimetype.startsWith('audio/')) {
          throw new Error('Only audio files are allowed')
        }

        return data
      },
    ],
    beforeChange: [
      ({ data, operation, originalDoc, req }) => {
        // Generate slug from title
        if (operation === 'create' && data.title) {
          data.slug = data.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
        } else if (operation === 'update' && originalDoc) {
          data.slug = originalDoc.slug
        }

        // TODO: Extract and validate audio duration
        // For now, this would require audio metadata extraction
        // which needs additional libraries like node-ffprobe or similar

        return data
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
      name: 'duration',
      type: 'number',
      admin: {
        description: 'Duration in minutes (auto-populated)',
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
    },
    {
      name: 'credit',
      type: 'text',
      admin: {
        description: 'Attribution or credit information',
      },
    },
  ],
}