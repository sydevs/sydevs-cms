import type { CollectionConfig } from 'payload'

export const MeditationFrames: CollectionConfig = {
  slug: 'meditationFrames',
  admin: {
    hidden: true, // Hide from admin panel navigation
    useAsTitle: 'id', // Use the auto-generated ID as the title
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
      admin: {
        description: 'Timestamp in seconds - used for ordering frames within a meditation',
      },
    },
  ],
}