import type { Access } from 'payload'

/**
 * Check if the authenticated user is an API client
 */
export const isAPIClient = (user: any): boolean => {
  return user?.collection === 'clients'
}

/**
 * Apply read-only access control for API clients
 * This helper wraps existing access control to enforce read-only access for API clients
 */
export const applyClientAccessControl = (access: {
  read?: Access
  create?: Access
  update?: Access
  delete?: Access
}) => {
  return {
    read: access.read || (() => true),
    create: (args: any) => {
      // API clients cannot create
      if (isAPIClient(args.req.user)) {
        return false
      }
      // Otherwise use the original access control
      if (typeof access.create === 'function') {
        return access.create(args)
      }
      return access.create || false
    },
    update: (args: any) => {
      // API clients cannot update
      if (isAPIClient(args.req.user)) {
        return false
      }
      // Otherwise use the original access control
      if (typeof access.update === 'function') {
        return access.update(args)
      }
      return access.update || false
    },
    delete: (args: any) => {
      // API clients cannot delete
      if (isAPIClient(args.req.user)) {
        return false
      }
      // Otherwise use the original access control
      if (typeof access.delete === 'function') {
        return access.delete(args)
      }
      return access.delete || false
    },
  }
}

/**
 * Block all access for specific collections (like Users and Clients)
 * API clients should never be able to access these collections
 */
export const blockAPIClientAccess = () => {
  return {
    read: ({ req: { user } }: any) => !isAPIClient(user),
    create: ({ req: { user } }: any) => !isAPIClient(user),
    update: ({ req: { user } }: any) => !isAPIClient(user),
    delete: ({ req: { user } }: any) => !isAPIClient(user),
  }
}

/**
 * Get the client ID from the authenticated user
 */
export const getClientId = (user: any): string | null => {
  if (isAPIClient(user) && user.id) {
    return user.id
  }
  return null
}

/**
 * Check if a client is active
 */
export const isClientActive = (user: any): boolean => {
  if (isAPIClient(user)) {
    return user.active === true
  }
  return false
}