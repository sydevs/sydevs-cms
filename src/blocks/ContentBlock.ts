import { Block } from 'payload'
import { validateCharacterCount } from '@/lib/validators/characterCount'

export const ContentBlock: Block = {
  slug: 'content',
  labels: {
    singular: 'Content Block',
    plural: 'Content Blocks',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      localized: true,
      admin: {
        description: 'Optional title for this content block',
      },
    },
    {
      name: 'text',
      type: 'richText',
      required: true,
      localized: true,
      validate: validateCharacterCount(250),
      admin: {
        description: 'Main content text (max 250 characters)',
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Optional image to accompany the content',
      },
    },
    {
      name: 'link',
      type: 'text',
      admin: {
        description: 'Optional link URL',
      },
    },
    {
      name: 'actionText',
      type: 'text',
      localized: true,
      admin: {
        description: 'Call-to-action text for the link',
        condition: (_, siblingData) => Boolean(siblingData?.link),
      },
    },
  ],
}