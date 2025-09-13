import { Block } from 'payload'

export const TextBlock: Block = {
  slug: 'text',
  labels: {
    singular: 'Text Block',
    plural: 'Text Blocks',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      localized: true,
      admin: {
        description: 'Optional title for this text block',
      },
    },
    {
      name: 'text',
      type: 'richText',
      required: true,
      localized: true,
      admin: {
        description: 'Rich text content',
      },
    },
  ],
}