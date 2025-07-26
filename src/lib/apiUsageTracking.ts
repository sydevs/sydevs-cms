import type { Payload } from 'payload'
import type { Client } from '@/payload-types'
import * as Sentry from '@sentry/nextjs'

// Simple in-memory cache for tracking API usage
const usageCache = new Map<string, number>()

// Configuration constants
const BATCH_SIZE = 10 // Update database every 10 requests
const HIGH_USAGE_LIMIT = 1000 // Alert threshold

/**
 * Track API usage for a client
 * Updates in-memory counter and periodically syncs to database
 */
export async function trackAPIUsage(clientId: string, payload: Payload): Promise<void> {
  if (!clientId) return
  
  // Increment counter in memory
  const currentCount = (usageCache.get(clientId) || 0) + 1
  usageCache.set(clientId, currentCount)
  
  // Update database in batches to reduce load
  if (currentCount % BATCH_SIZE === 0) {
    await updateClientUsage(clientId, currentCount, payload)
  }
}

/**
 * Update client usage statistics in database
 */
async function updateClientUsage(
  clientId: string, 
  requestCount: number, 
  payload: Payload
): Promise<void> {
  try {
    const client = await payload.findByID({
      collection: 'clients',
      id: clientId,
    }) as Client
    
    if (!client) {
      payload.logger.error({ msg: 'Client not found for usage update', clientId })
      return
    }
    
    // Calculate new usage stats
    const today = new Date().toISOString().split('T')[0]
    const isNewDay = client.usageStats?.lastRequestAt?.split('T')[0] !== today
    
    const updatedStats = {
      totalRequests: (client.usageStats?.totalRequests || 0) + BATCH_SIZE,
      dailyRequests: isNewDay ? BATCH_SIZE : (client.usageStats?.dailyRequests || 0) + BATCH_SIZE,
      lastRequestAt: new Date().toISOString(),
    }
    
    // Update client record
    await payload.update({
      collection: 'clients',
      id: clientId,
      data: {
        usageStats: updatedStats,
      },
    })
    
    // Check for high usage
    if (updatedStats.dailyRequests >= HIGH_USAGE_LIMIT) {
      logHighUsage(client, updatedStats.dailyRequests)
    }
    
    // Reset cache counter after successful update
    usageCache.set(clientId, requestCount - BATCH_SIZE)
    
  } catch (error) {
    payload.logger.error({
      msg: 'Failed to update client usage',
      err: error,
      clientId,
    })
  }
}

/**
 * Log high usage alert to Sentry
 */
function logHighUsage(client: Client, dailyRequests: number): void {
  Sentry.captureMessage(`High API usage: ${client.name}`, {
    level: 'warning',
    extra: {
      clientId: client.id,
      clientName: client.name,
      dailyRequests,
      primaryContact: client.primaryContact,
    },
  })
}

/**
 * Initialize usage tracking with periodic cleanup
 */
export function initializeUsageTracking(payload: Payload): void {
  // Reset counters at midnight UTC
  scheduleDailyReset(payload)
  
  // Flush remaining counts on shutdown
  process.once('SIGINT', () => flushAllCounts(payload))
  process.once('SIGTERM', () => flushAllCounts(payload))
}

/**
 * Schedule daily counter reset at midnight UTC
 */
function scheduleDailyReset(payload: Payload): void {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setUTCHours(24, 0, 0, 0)
  const msUntilMidnight = midnight.getTime() - now.getTime()
  
  // Reset at next midnight
  setTimeout(() => {
    resetDailyCounters(payload)
    // Then reset every 24 hours
    setInterval(() => resetDailyCounters(payload), 24 * 60 * 60 * 1000)
  }, msUntilMidnight)
}

/**
 * Reset daily request counters for all clients
 */
async function resetDailyCounters(payload: Payload): Promise<void> {
  try {
    // Clear in-memory cache
    usageCache.clear()
    
    // Reset database counters
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
          },
        },
      })
    }
    
    payload.logger.info({ msg: 'Reset daily usage counters' })
  } catch (error) {
    payload.logger.error({
      msg: 'Failed to reset daily counters',
      err: error,
    })
  }
}

/**
 * Flush all pending usage counts to database
 */
async function flushAllCounts(payload: Payload): Promise<void> {
  for (const [clientId, count] of usageCache.entries()) {
    if (count > 0) {
      await updateClientUsage(clientId, count, payload)
    }
  }
}