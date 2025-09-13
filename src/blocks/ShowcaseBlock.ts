import { Block, Validate } from 'payload'

export const ShowcaseBlock: Block = {
  slug: 'showcase',
  labels: {
    singular: 'Showcase Block',
    plural: 'Showcase Blocks',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      localized: true,
      admin: {
        description: 'Optional title for this showcase',
      },
    },
    {
      name: 'collectionType',
      type: 'select',
      required: true,
      options: [
        {
          label: 'Media',
          value: 'media',
        },
        {
          label: 'Meditations',
          value: 'meditations',
        },
        {
          label: 'Articles',
          value: 'articles',
        },
      ],
      admin: {
        description: 'Type of collection to showcase',
      },
    },
    {
      name: 'items',
      type: 'relationship',
      hasMany: true,
      maxRows: 10,
      relationTo: ['media', 'meditations', 'articles'],
      validate: ((value: unknown) => {
        if (!value) return true
        
        if (Array.isArray(value) && value.length > 10) {
          return 'Maximum 10 items allowed'
        }
        
        return true
      }) as Validate,
      admin: {
        description: 'Select items to showcase (max 10)',
        condition: (_, siblingData) => Boolean(siblingData?.collectionType),
        filterOptions: ({ siblingData }) => {
          if (!siblingData?.collectionType) return false
          
          // Filter to only show relationships from the selected collection type
          return {
            relationTo: {
              equals: siblingData.collectionType,
            },
          }
        },
      },
    },
  ],
}