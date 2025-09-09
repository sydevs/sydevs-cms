import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { FRAME_CATEGORY_OPTIONS, GENDER_OPTIONS } from '@/lib/data'
import { convertFile, processFile, sanitizeFilename } from '@/lib/fieldUtils'

export const Frames: CollectionConfig = {
  labels: {
    plural: 'Meditation Frames',
    singular: 'Meditation Frame',
  },
  slug: 'frames',
  access: permissionBasedAccess('frames'),
  upload: {
    hideRemoveFile: true,
    disableLocalStorage: true,
    adminThumbnail: 'small',
    mimeTypes: [
      // Images
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      // Videos
      'video/mp4',
      'video/webm',
    ],
    imageSizes: [
      {
        name: 'small',
        width: 160,
        height: 160,
        position: 'centre',
      },
      {
        name: 'medium',
        width: 320,
        height: 320,
        position: 'centre',
      },
      {
        name: 'full',
        width: 1000,
        height: 1000,
        position: 'centre',
      },
    ],
  },
  admin: {
    group: 'Resources',
    useAsTitle: 'filename',
    defaultColumns: ['category', 'tags', 'preview', 'imageSet'],
  },
  hooks: {
    beforeOperation: [sanitizeFilename],
    afterRead: [trackClientUsageHook],
    beforeValidate: [processFile({})],
    beforeChange: [convertFile],
    afterChange: [
      // Process thumbnail data if generated
      async ({ data, req }) => {
        if (data.thumbnailData && req.payload) {
          try {
            // Create thumbnail file entry in the same collection
            const thumbnailFile = {
              data: data.thumbnailData.data,
              mimetype: data.thumbnailData.mimetype,
              name: data.thumbnailData.name,
              size: data.thumbnailData.size
            }
            
            // Create thumbnail as a separate document
            const thumbnailDoc = await req.payload.create({
              collection: 'frames',
              data: {
                filename: data.thumbnailData.name,
                category: data.category,
                imageSet: data.imageSet,
                tags: ['thumbnail'], // Mark as thumbnail
              },
              file: thumbnailFile
            })
            
            // Link thumbnail to original video
            await req.payload.update({
              collection: 'frames', 
              id: data.id,
              data: {
                thumbnail: thumbnailDoc.id
              }
            })
            
            // Clean up temporary thumbnail data
            delete data.thumbnailData
          } catch (error) {
            console.warn('Failed to process thumbnail:', error instanceof Error ? error.message : 'Unknown error')
          }
        }
        return data
      }
    ],
  },
  fields: [
    {
      name: 'preview',
      type: 'text',
      virtual: true,
      admin: {
        hidden: true,
        components: {
          Cell: '@/components/admin/ThumbnailCell',
        },
      },
    },
    {
      name: 'imageSet',
      type: 'select',
      options: GENDER_OPTIONS,
      required: true,
    },
    {
      name: 'category',
      type: 'select',
      options: [...FRAME_CATEGORY_OPTIONS],
      required: true,
    },
    {
      name: 'tags',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Anahat', value: 'anahat' },
        { label: 'Back', value: 'back' },
        { label: 'Bandhan', value: 'bandhan' },
        { label: 'Both Hands', value: 'both hands' },
        { label: 'Center', value: 'center' },
        { label: 'Channel', value: 'channel' },
        { label: 'Earth', value: 'earth' },
        { label: 'Ego', value: 'ego' },
        { label: 'Feel', value: 'feel' },
        { label: 'Ham Ksham', value: 'ham ksham' },
        { label: 'Hamsa', value: 'hamsa' },
        { label: 'Hand', value: 'hand' },
        { label: 'Hands', value: 'hands' },
        { label: 'Ida', value: 'ida' },
        { label: 'Left', value: 'left' },
        { label: 'Left Handed', value: 'lefthanded' },
        { label: 'Massage', value: 'massage' },
        { label: 'Pingala', value: 'pingala' },
        { label: 'Raise', value: 'raise' },
        { label: 'Right', value: 'right' },
        { label: 'Right Handed', value: 'righthanded' },
        { label: 'Rising', value: 'rising' },
        { label: 'Silent', value: 'silent' },
        { label: 'Superego', value: 'superego' },
        { label: 'Tapping', value: 'tapping' },
      ],
    },
    {
      name: 'duration',
      type: 'number',
      hooks: {
        afterRead: [
          async ({ data }) => {
            return data &&
              typeof data.fileMetadata === 'object' &&
              typeof data.fileMetadata.duration === 'number'
              ? Math.round(data.fileMetadata.duration)
              : undefined
          },
        ],
      },
    },
    {
      name: 'thumbnail',
      type: 'relationship',
      relationTo: 'frames',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Auto-generated thumbnail (for videos only)'
      }
    },
    {
      name: 'fileMetadata',
      type: 'json',
      defaultValue: {},
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
}
