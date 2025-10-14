import { Block } from 'payload'
import { validateCharacterCount } from '@/lib/validators/characterCount'
import { MediaField } from '@/fields'

export const TextBoxBlock: Block = {
  slug: 'textbox',
  labels: {
    singular: 'Text Box',
    plural: 'Text Boxes',
  },
  fields: [
    {
      name: 'style',
      type: 'select',
      required: true,
      defaultValue: 'splash',
      options: [
        {
          label: 'Splash',
          value: 'splash',
        },
        {
          label: 'Left Aligned',
          value: 'leftAligned',
        },
        {
          label: 'Right Aligned',
          value: 'rightAligned',
        },
        {
          label: 'Overlay',
          value: 'overlay',
        },
        {
          label: 'Overlay Dark',
          value: 'overlayDark',
        },
      ],
      admin: {
        description: 'Display style for the text box',
      },
    },
    {
      name: 'title',
      type: 'text',
      localized: true,
      admin: {
        description: 'Optional title for this text box',
      },
    },
    {
      name: 'subtitle',
      type: 'text',
      localized: true,
      admin: {
        description: 'Optional subtitle for this text box',
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
    MediaField({
      name: 'image',
      orientation: 'portrait',
      admin: {
        description: 'Optional image to accompany the content',
      },
    }),
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
    {
      name: 'importData',
      type: 'json',
      admin: {
        readOnly: true,
        hidden: true,
        description: 'Original import data (background, color, position, spacing, decorations)',
      },
    },
  ],
}
