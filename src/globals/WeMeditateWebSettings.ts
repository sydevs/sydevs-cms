import type { GlobalConfig } from 'payload'
import { adminOnlyAccess } from '@/lib/accessControl'

export const WeMeditateWebSettings: GlobalConfig = {
  slug: 'we-meditate-web-settings',
  access: adminOnlyAccess(),
  admin: {
    group: 'Configuration',
  },
  label: 'We Meditate Web Settings',
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Static Pages',
          admin: {
            description: 'Select the page content for each static page.',
          },
          fields: [
            {
              name: 'homePage',
              label: 'Home Page',
              type: 'relationship',
              relationTo: 'pages',
              required: true,
            },
            {
              name: 'musicPage',
              label: 'Music Page',
              type: 'relationship',
              relationTo: 'pages',
              required: true,
            },
            {
              name: 'classesPage',
              label: 'Classes Page',
              type: 'relationship',
              relationTo: 'pages',
              required: true,
            },
            {
              name: 'subtleSystemPage',
              label: 'Subtle System Page',
              type: 'relationship',
              relationTo: 'pages',
              required: true,
            },
            {
              name: 'techniquesPage',
              label: 'Techniques Page',
              type: 'relationship',
              relationTo: 'pages',
              required: true,
            },
            {
              name: 'inspirationPage',
              label: 'Inspiration Page',
              type: 'relationship',
              relationTo: 'pages',
              required: true,
            },
          ],
        },
        {
          label: 'Navigation',
          fields: [
            {
              name: 'featuredPages',
              label: 'Featured Pages',
              type: 'relationship',
              relationTo: 'pages',
              hasMany: true,
              minRows: 3,
              maxRows: 7,
              required: true,
              admin: {
                description: 'Select 3-7 pages to feature in the website menu. Drag to reorder.',
              },
            },
          ],
        },
        {
          label: 'Tag Filters',
          fields: [
            {
              name: 'inspirationPageTags',
              label: 'Inspiration Page Tags',
              type: 'relationship',
              relationTo: 'page-tags',
              hasMany: true,
              minRows: 3,
              maxRows: 5,
              required: true,
              admin: {
                description: 'Select 3-5 page tags to display on the Inspiration page',
              },
            },
            {
              name: 'musicPageTags',
              label: 'Music Page Tags',
              type: 'relationship',
              relationTo: 'music-tags',
              hasMany: true,
              minRows: 3,
              maxRows: 5,
              required: true,
              admin: {
                description: 'Select 3-5 music tags to display on the Music page',
              },
            },
          ],
        },
      ],
    },
  ],
}
