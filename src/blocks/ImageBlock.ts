import { Block } from 'payload'

export const ImageBlock: Block = {
  slug: 'image',
  labels: {
    singular: 'Image Block',
    plural: 'Image Blocks',
  },
  fields: [
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: {
        description: 'Image to display',
      },
    },
    {
      name: 'caption',
      type: 'text',
      localized: true,
      admin: {
        description: 'Optional caption for the image',
      },
    },
    {
      name: 'display',
      type: 'select',
      defaultValue: 'normal',
      options: [
        {
          label: 'Normal',
          value: 'normal',
        },
        {
          label: 'Full Width',
          value: 'full',
        },
        {
          label: 'Float Left',
          value: 'floatLeft',
        },
        {
          label: 'Float Right',
          value: 'floatRight',
        },
      ],
      admin: {
        description: 'Display style for the image',
      },
    },
  ],
}