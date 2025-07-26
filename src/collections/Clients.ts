import type { CollectionConfig } from 'payload'
import { validateClientData, checkHighUsageAlert } from '@/hooks/clientHooks'

export const Clients: CollectionConfig = {
  slug: 'clients',
  auth: {
    useAPIKey: true,
    disableLocalStrategy: true, // Only API key authentication
  },
  admin: {
    group: 'Access',
    useAsTitle: 'name',
    defaultColumns: ['name', 'active', 'role', 'usageStats.dailyRequests'],
  },
  access: {
    read: ({ req: { user } }) => {
      // Clients cannot read the clients collection
      if (user?.collection === 'clients') {
        return false
      }
      // Users can read all clients
      return !!user
    },
    create: ({ req: { user } }) => {
      // Only users can create clients
      return user?.collection === 'users'
    },
    update: ({ req: { user } }) => {
      // Only users can update clients
      if (user?.collection === 'users') {
        return true
      }
      return false
    },
    delete: ({ req: { user } }) => {
      // Only users can delete clients
      return user?.collection === 'users'
    },
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'Client Name',
      admin: {
        description: 'Client organization or application name',
      },
    },
    {
      name: 'notes',
      type: 'textarea',
      label: 'Notes',
      admin: {
        description: 'Purpose and usage notes for this client',
      },
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'full-access',
      options: [
        {
          label: 'Full Access',
          value: 'full-access',
        },
        // Future roles can be added here
      ],
      admin: {
        description: 'Access level for this client (currently only Full Access)',
      },
    },
    {
      name: 'managers',
      type: 'relationship',
      relationTo: 'users',
      hasMany: true,
      required: true,
      admin: {
        description: 'Users who can manage this client',
      },
    },
    {
      name: 'primaryContact',
      type: 'relationship',
      relationTo: 'users',
      hasMany: false,
      required: true,
      admin: {
        description: 'Primary user contact for this client',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description: 'Enable or disable API access for this client',
      },
    },
    {
      name: 'keyGeneratedAt',
      type: 'date',
      admin: {
        readOnly: true,
        description: 'Timestamp of last API key generation',
        position: "sidebar",
      },
    },
    {
      name: 'usageStats',
      type: 'group',
      admin: {
        description: 'API usage statistics',
        position: "sidebar",
      },
      fields: [
        {
          name: 'totalRequests',
          type: 'number',
          defaultValue: 0,
          admin: {
            readOnly: true,
            description: 'All-time request count',
          },
        },
        {
          name: 'dailyRequests',
          type: 'number',
          defaultValue: 0,
          admin: {
            readOnly: true,
            description: "Today's request count",
          },
        },
        {
          name: 'lastRequestAt',
          type: 'date',
          admin: {
            readOnly: true,
            description: 'Last API call timestamp',
          },
        },
        {
          name: 'lastResetAt',
          type: 'date',
          admin: {
            readOnly: true,
            description: 'Last daily counter reset',
          },
        },
        {
          name: 'highUsageAlert',
          type: 'checkbox',
          virtual: true,
          admin: {
            readOnly: true,
            description: 'Indicates if daily limit exceeded (>1000 requests)',
            components: {
              Field: {
                path: '@/components/admin/HighUsageAlert',
                clientProps: {
                  threshold: 1000,
                },
              },
            },
          },
        },
      ],
    },
  ],
  hooks: {
    beforeChange: [
      validateClientData,
    ],
    afterChange: [
      checkHighUsageAlert,
    ],
  },
}