import type { Access, CollectionConfig, PayloadRequest, TypedUser } from 'payload'

// Permission types
export interface Permission {
  collection: string
  level: 'Translate' | 'Manage' | 'Read'
  locales: string[]
}

export interface UserWithPermissions extends TypedUser {
  admin?: boolean
  permissions?: Permission[]
}

export interface ClientWithPermissions extends TypedUser {
  permissions?: Permission[]
}

/**
 * Check if the authenticated user is an API client
 */
export const isAPIClient = (user: TypedUser | null) => {
  return user?.collection === 'clients'
}

/**
 * Get the list of collections that should be excluded from permission options
 * (Users, Clients, and any hidden collections)
 */
export const getExcludedCollections = (): string[] => {
  return ['users', 'clients', 'meditationframes'] // Hidden collections like join tables
}

/**
 * Get available collection options for permission fields
 */
export const getAvailableCollections = (): Array<{ label: string; value: string }> => {
  const excluded = getExcludedCollections()
  
  // These should match the collections in your collections/index.ts
  const allCollections = [
    { label: 'Meditations', value: 'meditations' },
    { label: 'Music', value: 'music' },
    { label: 'Frames', value: 'frames' },
    { label: 'Media', value: 'media' },
    { label: 'Narrators', value: 'narrators' },
    { label: 'Tags', value: 'tags' },
  ]
  
  return allCollections.filter(collection => !excluded.includes(collection.value))
}

/**
 * Check if a user has permission for a specific collection and operation
 */
export const hasPermission = (
  user: UserWithPermissions | ClientWithPermissions | null,
  collection: string,
  operation: 'read' | 'create' | 'update' | 'delete',
  locale?: string
): boolean => {
  if (!user?.active) return false
  
  // Admin users bypass all restrictions
  if (!isAPIClient(user) && (user as UserWithPermissions).admin) {
    return true
  }
  
  // Users and Clients collections are completely blocked for API clients
  if (isAPIClient(user) && (collection === 'users' || collection === 'clients')) {
    return false
  }
  
  // Check if collection is in excluded list
  if (getExcludedCollections().includes(collection)) {
    return !isAPIClient(user) // Only allow admin users for excluded collections
  }
  
  const permissions = user.permissions || []
  
  // Find permission for this collection
  const permission = permissions.find(p => p.collection === collection)
  if (!permission) {
    // Users have default read access to all collections
    // API clients have no default access
    return !isAPIClient(user) && operation === 'read'
  }
  
  // Check locale access if locale is specified
  if (locale && !permission.locales.includes('all') && !permission.locales.includes(locale)) {
    return false
  }
  
  // Check operation permissions based on level
  if (isAPIClient(user)) {
    // API client permissions
    switch (permission.level) {
      case 'Read':
        return operation === 'read'
      case 'Manage':
        return operation === 'read' || operation === 'create' || operation === 'update'
        // Note: API clients never get delete access, even with Manage permission
      default:
        return false
    }
  } else {
    // User permissions
    switch (permission.level) {
      case 'Translate':
        return operation === 'read' || operation === 'update'
        // Translate users cannot create or delete
      case 'Manage':
        return true // Full access for manage users
      default:
        return operation === 'read' // Default read access for users
    }
  }
}

/**
 * Create field-level access control function for use in collection field definitions
 */
export const createFieldAccess = (collectionSlug: string, field: any) => {
  return {
    read: ({ req }: { req: PayloadRequest }) => {
      return hasFieldAccess(req.user as UserWithPermissions, collectionSlug, field, 'read')
    },
    update: ({ req }: { req: PayloadRequest }) => {
      return hasFieldAccess(req.user as UserWithPermissions, collectionSlug, field, 'update')
    }
  }
}

/**
 * Check if a user can access a specific field (for field-level restrictions)
 */
export const hasFieldAccess = (
  user: UserWithPermissions | null,
  collection: string,
  field: any,
  operation: 'read' | 'update',
  locale?: string
): boolean => {
  if (!user?.active) return false
  
  // Admin users bypass all restrictions
  if (user.admin) return true
  
  // API clients don't have field-level restrictions (handled at collection level)
  if (isAPIClient(user)) return true
  
  const permissions = user.permissions || []
  const permission = permissions.find(p => p.collection === collection)
  
  if (!permission) {
    return operation === 'read' // Default read access
  }
  
  // Check locale access
  if (locale && !permission.locales.includes('all') && !permission.locales.includes(locale)) {
    return false
  }
  
  // Translate users can only edit localized fields
  if (permission.level === 'Translate' && operation === 'update') {
    return field.localized === true
  }
  
  return true
}

/**
 * Create locale-aware query filter for collections
 */
export const createLocaleFilter = (
  user: UserWithPermissions | ClientWithPermissions | null,
  collection: string
) => {
  if (!user?.active) return false
  
  // Admin users bypass all filters
  if (!isAPIClient(user) && (user as UserWithPermissions).admin) {
    return true
  }
  
  const permissions = user.permissions || []
  const permission = permissions.find(p => p.collection === collection)
  
  if (!permission) {
    // Users have default read access, API clients have no default access
    return !isAPIClient(user)
  }
  
  // If user has 'all' locales permission, no filtering needed
  if (permission.locales.includes('all')) {
    return true
  }
  
  // Create locale filter for specific locales
  // This returns a query that can be used by Payload to filter results
  return {
    or: [
      // Documents with no locale (non-localized content)
      { locale: { exists: false } },
      // Documents with permitted locales
      { locale: { in: permission.locales } }
    ]
  }
}

/**
 * New permission-based access control for collections that should be accessible to API clients
 */
export const permissionBasedAccess = (
  collectionSlug: string,
  access: CollectionConfig['access'] = {}
): CollectionConfig['access'] => {
  return {
    ...access,
    read: ({ req }) => {
      const hasAccess = hasPermission(req.user as any, collectionSlug, 'read')
      if (!hasAccess) return false
      
      // Apply locale filtering if user has restricted locale access
      const localeFilter = createLocaleFilter(req.user as any, collectionSlug)
      return localeFilter
    },
    create: ({ req }) => {
      return hasPermission(req.user as any, collectionSlug, 'create')
    },
    update: ({ req }) => {
      const hasAccess = hasPermission(req.user as any, collectionSlug, 'update')
      if (!hasAccess) return false
      
      // Apply locale filtering for updates
      const localeFilter = createLocaleFilter(req.user as any, collectionSlug)
      return localeFilter
    },
    delete: ({ req }) => {
      return hasPermission(req.user as any, collectionSlug, 'delete')
    },
  }
}

/**
 * Access control for Users and Clients collections (admin only)
 */
export const adminOnlyAccess = (access: CollectionConfig['access'] = {}): CollectionConfig['access'] => {
  return {
    ...access,
    read: ({ req }) => !isAPIClient(req.user) && basicAccess(req, access?.read || true),
    create: ({ req }) => !isAPIClient(req.user) && basicAccess(req, access?.create || true),
    update: ({ req }) => !isAPIClient(req.user) && basicAccess(req, access?.update || true),
    delete: ({ req }) => !isAPIClient(req.user) && basicAccess(req, access?.delete || true),
  }
}

// Legacy function - kept for backward compatibility but will be replaced
export const readApiAccess = (access: CollectionConfig['access'] = {}): CollectionConfig['access'] => {
  return {
    ...access,
    read: ({ req }) => basicAccess(req, access?.read || true),
    create: ({ req }) => !isAPIClient(req.user) && basicAccess(req, access?.create || true),
    update: ({ req }) => !isAPIClient(req.user) && basicAccess(req, access?.update || true),
    delete: ({ req }) => !isAPIClient(req.user) && basicAccess(req, access?.delete || true),
  }
}

function basicAccess(req: PayloadRequest, value?: Access | boolean) {
  const user = req.user as TypedUser
  
  if (!user?.active) {
    return false
  } else if (typeof value === 'function') {
    return value({ req })
  } else {
    return value !== undefined ? value : true
  }
}
