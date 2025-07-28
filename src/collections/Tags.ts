import type { CollectionConfig } from 'payload'
import { readApiAccess } from '@/lib/accessControl'
import { createAPITrackingHook } from '@/hooks/clientHooks'

export const Tags: CollectionConfig = {
  slug: 'tags',
  access: readApiAccess(),
  hooks: {
    afterRead: [createAPITrackingHook()],
  },
  admin: {
    group: 'Utility',
    useAsTitle: 'title',
    hidden: true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'meditations',
      type: 'join',
      collection: 'meditations',
      on: 'tags',
    },
    {
      name: 'music',
      type: 'join',
      collection: 'music',
      on: 'tags',
    },
    {
      name: 'media',
      type: 'join',
      collection: 'media',
      on: 'tags',
    },
    {
      name: 'frames',
      type: 'join',
      collection: 'frames',
      on: 'tags',
    },
  ],
}