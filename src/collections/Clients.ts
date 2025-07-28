import type { CollectionConfig } from 'payload'
import { validateClientData, checkHighUsageAlert } from '@/hooks/clientHooks'
import { adminOnlyAccess } from '@/lib/accessControl'

export const Clients: CollectionConfig = {
  slug: 'clients',
  auth: {
    useAPIKey: true,
    disableLocalStrategy: true, // Only API key authentication
  },
  admin: {
    group: 'Access',
    useAsTitle: 'name',
    defaultColumns: ['name', 'active', 'role'],
  },
  access: adminOnlyAccess(),
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
      name: 'domains',
      type: 'text',
      admin: {
        description: 'What domains are associated with this client. Put each domain on a new line.',
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