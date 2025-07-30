import { PermissionRowLabel } from '@/components/admin/PermissionRowLabel'
import { adminOnlyAccess, getAvailableCollections } from '@/lib/accessControl'
import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  access: adminOnlyAccess(),
  auth: {
    verify: false, // TODO: Re-enable this but ensure there are proper warnings.
    maxLoginAttempts: 5,
    lockTime: 600 * 1000, // 10 minutes
  },
  admin: {
    group: 'Access',
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'active', 'admin'],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'admin',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Admin users bypass all permission restrictions and have complete access to all collections and features.',
      },
    },
    {
      name: 'permissions',
      type: 'array',
      admin: {
        isSortable: false,
        description: 'Granular permissions for specific collections and locales. Not needed for admin users.',
        condition: (data) => !data.admin, // Hide permissions field for admin users
        components: {
          RowLabel: '@/components/admin/PermissionRowLabel',
        },
      },
      fields: [
        {
          name: 'allowedCollection',
          type: 'select',
          required: true,
          options: getAvailableCollections(),
          admin: {
            description: 'Select the collection to grant permissions for',
          },
        },
        {
          name: 'level',
          type: 'select',
          required: true,
          options: [
            {
              label: 'Translate',
              value: 'Translate',
            },
            {
              label: 'Manage',
              value: 'Manage',
            },
          ],
          admin: {
            description: 'Translate: Can edit localized fields only. Manage: Full create/update/delete access within specified locales.',
          },
        },
        {
          name: 'locales',
          type: 'select',
          hasMany: true,
          required: true,
          options: [
            {
              label: 'All Locales',
              value: 'all',
            },
            {
              label: 'English',
              value: 'en',
            },
            {
              label: 'Italian',
              value: 'it',
            },
          ],
          admin: {
            description: 'Select which locales this permission applies to. "All Locales" grants unrestricted locale access.',
          },
        },
      ],
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description: 'Enable or disable this user',
      },
    },
  ],
}
