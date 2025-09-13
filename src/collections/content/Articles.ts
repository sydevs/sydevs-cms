import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'
import { generateSlug } from '@/lib/fieldUtils'
import {
  ContentBlock,
  ImageBlock,
  TextBlock,
  LayoutBlock,
  ShowcaseBlock,
} from '@/blocks'

export const Articles: CollectionConfig = {
  slug: 'articles',
  access: permissionBasedAccess('articles'),
  trash: true,
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['thumbnail', 'title', 'category', 'publishAt'],
  },
  hooks: {
    beforeChange: [generateSlug],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'thumbnail',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: {
        components: {
          Cell: {
            path: '@/components/admin/ThumbnailCell#default',
            clientProps: {
              aspectRatio: '16:9',
              size: 'large',
            },
          },
        },
      },
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
      name: 'publishAt',
      type: 'date',
      admin: {
        position: 'sidebar',
        date: {
          pickerAppearance: 'dayOnly',
          minDate: new Date(),
        },
        components: {
          Cell: '@/components/admin/PublishStateCell',
          afterInput: ['@/components/admin/PublishAtAfterInput'],
        },
      },
    },
    {
      name: 'category',
      type: 'select',
      required: true,
      options: [
        {
          label: 'Technique',
          value: 'technique',
        },
        {
          label: 'Artwork',
          value: 'artwork',
        },
        {
          label: 'Event',
          value: 'event',
        },
        {
          label: 'Knowledge',
          value: 'knowledge',
        },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'tags',
      type: 'select',
      hasMany: true,
      options: [
        {
          label: 'Living',
          value: 'living',
        },
        {
          label: 'Creativity',
          value: 'creativity',
        },
        {
          label: 'Wisdom',
          value: 'wisdom',
        },
        {
          label: 'Stories',
          value: 'stories',
        },
        {
          label: 'Events',
          value: 'events',
        },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'content',
      type: 'blocks',
      blocks: [
        ContentBlock,
        ImageBlock,
        TextBlock,
        LayoutBlock,
        ShowcaseBlock,
      ],
      admin: {
        description: 'Build your article content using blocks',
      },
    },
  ],
}