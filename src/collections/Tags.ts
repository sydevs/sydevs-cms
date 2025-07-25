import type { CollectionConfig } from 'payload'
import { applyClientAccessControl } from '@/lib/clientAccessControl'
import { createAPITrackingHook } from '@/hooks/clientHooks'

export const Tags: CollectionConfig = {
  slug: 'tags',
  access: applyClientAccessControl({
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  }),
  hooks: {
    afterRead: [createAPITrackingHook()],
  },
  admin: {
    group: 'Utility',
    useAsTitle: 'title',
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