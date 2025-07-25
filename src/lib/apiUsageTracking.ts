import type { Payload } from 'payload'
import * as Sentry from '@sentry/nextjs'

interface UsageCacheEntry {
  count: number
  lastFlush: Date
  totalCount: number
}

// In-memory cache for API usage tracking
const usageCache = new Map<string, UsageCacheEntry>()

// Configuration
const FLUSH_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const FLUSH_THRESHOLD = 100 // Flush after 100 requests
const HIGH_USAGE_THRESHOLD = 1000 // Daily requests threshold
const DAILY_RESET_HOUR = 0 // Midnight UTC

// Track when we last reset daily counters
let lastDailyReset = new Date()

/**
 * Check if we need to reset daily counters
 */
const shouldResetDaily = (): boolean => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DAILY_RESET_HOUR)
  
  if (now >= today && lastDailyReset < today) {
    lastDailyReset = today
    return true
  }
  
  return false
}

/**
 * Reset daily counters for all clients
 */
export const resetDailyCounters = async (payload: Payload): Promise<void> => {
  try {
    const clients = await payload.find({
      collection: 'clients',
      limit: 1000,
      where: {
        'usageStats.dailyRequests': {
          greater_than: 0,
        },
      },
    })
    
    for (const client of clients.docs) {
      await payload.update({
        collection: 'clients',
        id: client.id,
        data: {
          usageStats: {
            ...client.usageStats,
            dailyRequests: 0,
            lastResetAt: new Date().toISOString(),
          },
        },
      })
    }
    
    // Clear cache entries
    usageCache.clear()
  } catch (error) {
    console.error('Error resetting daily counters:', error)
    Sentry.captureException(error)
  }
}

/**
 * Flush cached usage data to database
 */
const flushUsageData = async (clientId: string, payload: Payload): Promise<void> => {
  const cacheEntry = usageCache.get(clientId)
  if (!cacheEntry || cacheEntry.count === 0) {
    return
  }
  
  try {
    const client = await payload.findByID({
      collection: 'clients',
      id: clientId,
    })
    
    if (!client) {
      console.error(`Client ${clientId} not found`)
      return
    }
    
    const updatedStats = {
      totalRequests: (client.usageStats?.totalRequests || 0) + cacheEntry.count,
      dailyRequests: (client.usageStats?.dailyRequests || 0) + cacheEntry.count,
      lastRequestAt: new Date().toISOString(),
      lastResetAt: client.usageStats?.lastResetAt || new Date().toISOString(),
    }
    
    await payload.update({
      collection: 'clients',
      id: clientId,
      data: {
        usageStats: updatedStats,
      },
    })
    
    // Check for high usage
    if (updatedStats.dailyRequests > HIGH_USAGE_THRESHOLD) {
      await handleHighUsage(client, updatedStats.dailyRequests, payload)
    }
    
    // Update cache entry
    cacheEntry.count = 0
    cacheEntry.lastFlush = new Date()
    cacheEntry.totalCount = updatedStats.totalRequests
  } catch (error) {
    console.error(`Error flushing usage data for client ${clientId}:`, error)
    Sentry.captureException(error)
  }
}

/**
 * Handle high usage detection
 */
const handleHighUsage = async (client: any, dailyRequests: number, _payload: Payload): Promise<void> => {
  // Log to Sentry
  Sentry.captureMessage(`High API usage detected for client: ${client.name}`, {
    level: 'warning',
    extra: {
      clientId: client.id,
      clientName: client.name,
      dailyRequests,
      primaryContact: client.primaryContact,
    },
  })
  
  // The highUsageAlert field is virtual and will be computed based on dailyRequests
  console.warn(`High usage alert for client ${client.name}: ${dailyRequests} requests today`)
}

/**
 * Track API usage for a client
 */
export const trackAPIUsage = async (clientId: string, payload: Payload): Promise<void> => {
  // Check for daily reset
  if (shouldResetDaily()) {
    await resetDailyCounters(payload)
  }
  
  // Get or create cache entry
  let cacheEntry = usageCache.get(clientId)
  if (!cacheEntry) {
    cacheEntry = {
      count: 0,
      lastFlush: new Date(),
      totalCount: 0,
    }
    usageCache.set(clientId, cacheEntry)
  }
  
  // Increment counter
  cacheEntry.count++
  
  // Check if we need to flush
  const now = new Date()
  const timeSinceFlush = now.getTime() - cacheEntry.lastFlush.getTime()
  
  if (cacheEntry.count >= FLUSH_THRESHOLD || timeSinceFlush >= FLUSH_INTERVAL_MS) {
    await flushUsageData(clientId, payload)
  }
}

/**
 * Force flush all cached usage data
 */
export const flushAllUsageData = async (payload: Payload): Promise<void> => {
  const clientIds = Array.from(usageCache.keys())
  
  for (const clientId of clientIds) {
    await flushUsageData(clientId, payload)
  }
}

/**
 * Initialize periodic flush
 */
export const initializeUsageTracking = (payload: Payload): void => {
  // Set up periodic flush
  setInterval(async () => {
    await flushAllUsageData(payload)
  }, FLUSH_INTERVAL_MS)
  
  // Set up daily reset check
  setInterval(async () => {
    if (shouldResetDaily()) {
      await resetDailyCounters(payload)
    }
  }, 60 * 1000) // Check every minute
  
  // Flush on process exit
  process.on('SIGINT', async () => {
    await flushAllUsageData(payload)
    process.exit(0)
  })
  
  process.on('SIGTERM', async () => {
    await flushAllUsageData(payload)
    process.exit(0)
  })
}