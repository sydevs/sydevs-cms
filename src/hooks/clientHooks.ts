import type { CollectionAfterReadHook, CollectionBeforeChangeHook, CollectionAfterChangeHook, Payload } from 'payload'
import { getClientId, isAPIClient, type AuthenticatedUser } from '@/lib/clientAccessControl'
import { trackAPIUsage, initializeUsageTracking } from '@/lib/apiUsageTracking'

/**
 * Hook to track API usage on all collection operations
 */
export const trackClientAPIUsage: CollectionAfterReadHook = async ({ req }) => {
  // Only track read operations for API clients
  const user = req.user as AuthenticatedUser
  if (isAPIClient(user)) {
    const clientId = getClientId(user)
    if (clientId && req.payload) {
      await trackAPIUsage(clientId, req.payload)
    }
  }
}

/**
 * Global hook to apply to all collections for API tracking
 */
export const createAPITrackingHook = (): CollectionAfterReadHook => {
  return trackClientAPIUsage
}

/**
 * Hook to validate client data before changes
 */
export const validateClientData: CollectionBeforeChangeHook = async ({ data, operation }) => {
  if (operation === 'create' || operation === 'update') {
    // Ensure primary contact is in managers list
    if (data?.primaryContact && data?.managers) {
      const managersArray = Array.isArray(data.managers) ? data.managers : [data.managers]
      if (!managersArray.includes(data.primaryContact)) {
        data.managers = [...managersArray, data.primaryContact]
      }
    }
    
    // Set keyGeneratedAt when API key is regenerated
    // This will be handled by Payload's internal API key generation
    
    // Initialize usage stats on creation
    if (operation === 'create' && !data.usageStats) {
      data.usageStats = {
        totalRequests: 0,
        dailyRequests: 0,
        lastRequestAt: null,
        lastResetAt: new Date().toISOString(),
      }
    }
  }
  
  return data
}

/**
 * Hook to check high usage after changes
 */
export const checkHighUsageAlert: CollectionAfterChangeHook = async ({ doc }) => {
  // Virtual field highUsageAlert will be computed based on dailyRequests
  if (doc?.usageStats?.dailyRequests > 1000) {
    // The field component will handle the visual alert
    // Log for monitoring
    console.warn(`High usage alert for client ${doc.name}: ${doc.usageStats.dailyRequests} requests today`)
  }
  
  return doc
}

/**
 * Initialize usage tracking on server startup
 * This should be called once when the server starts
 */
export const initializeAPIUsageTracking = (payload: Payload): void => {
  // Initialize the periodic flush and daily reset
  initializeUsageTracking(payload)
}