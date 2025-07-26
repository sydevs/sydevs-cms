import type { CollectionConfig, PayloadRequest } from 'payload'
import type { User, Client } from '@/payload-types'

export type AuthenticatedUser = (User & { collection: 'users' }) | (Client & { collection: 'clients' }) | null

type AccessFunction = ({ req }: { req: PayloadRequest }) => boolean | Promise<boolean>
type AccessControl = {
  read?: AccessFunction | boolean
  create?: AccessFunction | boolean
  update?: AccessFunction | boolean
  delete?: AccessFunction | boolean
}

/**
 * Check if the authenticated user is an API client
 */
export const isAPIClient = (user: AuthenticatedUser): user is (Client & { collection: 'clients' }) => {
  return user?.collection === 'clients'
}

/**
 * Apply read-only access control for API clients
 * This helper wraps existing access control to enforce read-only access for API clients
 */
export const applyClientAccessControl = (access: AccessControl): CollectionConfig['access'] => {
  return {
    read: ({ req }: { req: PayloadRequest }) => {
      const user = req.user as AuthenticatedUser
      // Check if client is active
      if (isAPIClient(user) && !isClientActive(user)) {
        return false
      }
      // Use original read access
      if (typeof access.read === 'function') {
        return access.read({ req })
      }
      return access.read !== undefined ? access.read : true
    },
    create: ({ req }: { req: PayloadRequest }) => {
      const user = req.user as AuthenticatedUser
      // API clients cannot create
      if (isAPIClient(user)) {
        return false
      }
      // Otherwise use the original access control
      if (typeof access.create === 'function') {
        return access.create({ req })
      }
      return access.create || false
    },
    update: ({ req }: { req: PayloadRequest }) => {
      const user = req.user as AuthenticatedUser
      // API clients cannot update
      if (isAPIClient(user)) {
        return false
      }
      // Otherwise use the original access control
      if (typeof access.update === 'function') {
        return access.update({ req })
      }
      return access.update || false
    },
    delete: ({ req }: { req: PayloadRequest }) => {
      const user = req.user as AuthenticatedUser
      // API clients cannot delete
      if (isAPIClient(user)) {
        return false
      }
      // Otherwise use the original access control
      if (typeof access.delete === 'function') {
        return access.delete({ req })
      }
      return access.delete || false
    },
  }
}

/**
 * Block all access for specific collections (like Users and Clients)
 * API clients should never be able to access these collections
 */
export const blockAPIClientAccess = (): CollectionConfig['access'] => {
  return {
    read: ({ req }: { req: PayloadRequest }) => !isAPIClient(req.user as AuthenticatedUser),
    create: ({ req }: { req: PayloadRequest }) => !isAPIClient(req.user as AuthenticatedUser),
    update: ({ req }: { req: PayloadRequest }) => !isAPIClient(req.user as AuthenticatedUser),
    delete: ({ req }: { req: PayloadRequest }) => !isAPIClient(req.user as AuthenticatedUser),
  }
}

/**
 * Get the client ID from the authenticated user
 */
export const getClientId = (user: AuthenticatedUser): string | null => {
  if (isAPIClient(user) && user.id) {
    return user.id
  }
  return null
}

/**
 * Check if a client is active
 */
export const isClientActive = (user: AuthenticatedUser): boolean => {
  if (isAPIClient(user)) {
    return user.active === true
  }
  return false
}