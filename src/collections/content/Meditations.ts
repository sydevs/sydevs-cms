import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { convertFile, processFile, sanitizeFilename } from '@/lib/fieldUtils'
import { KeyframeData, KeyframeDefinition } from '@/components/admin/MeditationFrameEditor/types'
import { MediaField } from '@/fields'
import { SlugField } from '@nouance/payload-better-fields-plugin/Slug'

export const Meditations: CollectionConfig = {
  slug: 'meditations',
  access: permissionBasedAccess('meditations'),
  trash: true,
  upload: {
    staticDir: 'media/meditations',
    bulkUpload: false,
    hideRemoveFile: true,
    mimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/aac', 'audio/ogg'],
  },
  admin: {
    group: 'Content',
    useAsTitle: 'label',
    defaultColumns: ['label', 'thumbnail', 'publishAt', 'tags', 'fileMetadata'],
  },
  hooks: {
    beforeOperation: [sanitizeFilename],
    beforeValidate: [processFile({})],
    beforeChange: [convertFile],
    afterRead: [trackClientUsageHook],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Details',
          fields: [
            {
              name: 'title',
              type: 'text',
              label: 'Public Title',
              required: true,
            },
            {
              name: 'label',
              type: 'text',
              label: 'Internal Name',
              required: true,
            },
            {
              name: 'locale',
              type: 'select',
              options: [
                { label: 'English', value: 'en' },
                { label: 'Czech', value: 'cs' },
              ],
              required: true,
              defaultValue: 'en',
            },
            {
              name: 'publishAt',
              type: 'date',
              admin: {
                date: {
                  pickerAppearance: 'dayOnly',
                  minDate: new Date(),
                },
                components: {
                  Cell: '@/components/admin/PublishStateCell',
                  afterInput: ['@/components/admin/PublishAtAfterInput'],
                },
              },
              validate: (value, { data }) => {
                // If publishAt is set, frames must be configured
                if (value) {
                  const meditationData = data as { frames?: KeyframeDefinition[] }
                  const frames = meditationData?.frames

                  if (!frames || !Array.isArray(frames) || frames.length === 0) {
                    return 'Cannot set publish date without configuring frames. Please add frames in the Meditation Video tab first.'
                  }
                }
                return true
              },
            },
            ...SlugField('title', {
              slugOverrides: {
                unique: true,
              },
            }),
            MediaField({
              name: 'thumbnail',
              required: true,
              tagName: 'meditation-thumbnail',
            }),
            {
              name: 'narrator',
              type: 'relationship',
              relationTo: 'narrators',
              required: true,
            },
            {
              name: 'tags',
              type: 'relationship',
              relationTo: 'meditation-tags',
              hasMany: true,
            },
            {
              name: 'musicTag',
              type: 'relationship',
              relationTo: 'music-tags',
              admin: {
                description: 'Music with this tag will be offered to the seeker',
              },
            },
            {
              name: 'fileMetadata',
              type: 'json',
              admin: {
                readOnly: true,
              },
            },
          ],
        },
        {
          label: 'Meditation Video',
          fields: [
            {
              name: 'frames',
              type: 'json',
              admin: {
                description:
                  'Frames associated with this meditation with audio-synchronized editing',
                components: {
                  Field: '@/components/admin/MeditationFrameEditor/index.tsx#default',
                },
              },
              validate: (value, { data, operation, id }) => {
                // Check if audio file has been uploaded
                const meditationData = data as { filename?: string; url?: string }
                const hasAudio = meditationData?.filename || meditationData?.url

                // Allow first save (create) without frames, only require on updates
                const isUpdate = operation === 'update' || !!id

                // If audio exists and this is an update, frames are required
                if (hasAudio && isUpdate && (!value || !Array.isArray(value) || value.length === 0)) {
                  return 'At least one frame is required. Please add frames in the Meditation Video tab.'
                }

                // If no audio, or this is a create operation, frames are optional
                if (!value || !Array.isArray(value)) {
                  return true
                }

                // Validate array structure if frames exist
                if (!Array.isArray(value)) {
                  return 'Frames must be an array'
                }

                for (let i = 0; i < value.length; i++) {
                  const frame = value[i]

                  if (!frame || typeof frame !== 'object') {
                    return `Frame ${i + 1} must be an object`
                  }

                  if (!frame.id || typeof frame.id !== 'string') {
                    return `Frame ${i + 1} must have a valid frame relationship ID`
                  }

                  if (
                    typeof frame.timestamp !== 'number' ||
                    frame.timestamp < 0 ||
                    isNaN(frame.timestamp)
                  ) {
                    return `Frame ${i + 1} must have a valid timestamp (number >= 0)`
                  }
                }

                // Check for duplicate timestamps
                const timestamps = value.map((f: { timestamp: number }) => f.timestamp)
                const uniqueTimestamps = new Set(timestamps)
                if (timestamps.length !== uniqueTimestamps.size) {
                  return 'Duplicate timestamps are not allowed. Each frame must have a unique timestamp.'
                }

                return true
              },
              hooks: {
                beforeChange: [
                  async ({ value }) => {
                    if (!value || !Array.isArray(value)) return []

                    return value
                      .map((v) => {
                        return { id: v.id, timestamp: v.timestamp } as KeyframeDefinition
                      })
                      .sort((a, b) => a.timestamp - b.timestamp)
                  },
                ],
                afterRead: [
                  async ({ value, req }) => {
                    if (!value || !Array.isArray(value)) return []
                    const frames = value as KeyframeData[]

                    const frameIds = frames.map((f) => f.id)
                    if (frameIds.length === 0) return []

                    const frameDocs = await req.payload.find({
                      collection: 'frames',
                      where: { id: { in: frameIds } },
                      limit: frameIds.length,
                    })

                    // Create map of relevant frame data
                    const frameMap = Object.fromEntries(
                      frameDocs.docs.map((frame) => [frame.id, frame]),
                    )

                    // Add data to each frame and sort by timestamp
                    return frames.map((v) => {
                      return {
                        ...v,
                        ...frameMap[v.id],
                        timestamp: Math.round(v.timestamp),
                      } as KeyframeData
                    })
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  ],
}
