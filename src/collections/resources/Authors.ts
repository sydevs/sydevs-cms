import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'

export const Authors: CollectionConfig = {
  slug: 'authors',
  access: permissionBasedAccess(),
  admin: {
    group: 'Resources',
    useAsTitle: 'name',
    defaultColumns: ['name', 'title', 'country_code'],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'title',
      type: 'text',
      localized: true,
      admin: {
        description: 'Professional title (e.g., "Artist, writer and stylist")',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      localized: true,
      admin: {
        description: 'Biography or description of the author',
      },
    },
    {
      name: 'country_code',
      type: 'text',
      admin: {
        description: 'ISO 2-letter country code',
      },
    },
    {
      name: 'years_meditating',
      type: 'number',
      admin: {
        description: 'Years of meditation experience',
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Author profile image',
      },
    },
  ],
}
