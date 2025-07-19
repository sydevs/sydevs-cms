import { getPayload, Payload } from 'payload'
import { payloadConfig } from '../../src/payload.config'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { MongoClient } from 'mongodb'
import { buildConfig } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { collections, Users } from '../../src/collections'
import { EmailTestAdapter } from './emailTestAdapter'
import type { PayloadRequest } from 'payload'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Creates an isolated test database and Payload instance for a test suite
 * Each call creates a unique database name to ensure complete isolation
 */
export async function createTestEnvironment(): Promise<{
  payload: Payload
  cleanup: () => Promise<void>
}> {
  const baseUri = process.env.TEST_MONGO_URI
  if (!baseUri) {
    throw new Error('TEST_MONGO_URI not available. Make sure globalSetup is configured.')
  }

  // Create a unique database name for this test environment
  const testDbName = `test_${Date.now()}_${Math.random().toString(36).substring(7)}`
  const mongoUri = `${baseUri}${testDbName}?retryWrites=true&w=majority`

  console.log(`🧪 Creating test environment with database: ${testDbName}`)


  const config = buildConfig({
    admin: {
      user: Users.slug,
      disable: true, // Disable admin UI in tests
    },
    collections,
    editor: lexicalEditor(),
    secret: process.env.PAYLOAD_SECRET || 'test-secret-key',
    typescript: {
      outputFile: path.resolve(__dirname, '../../src/payload-types.ts'),
    },
    db: mongooseAdapter({
      url: mongoUri,
    }),
  })
  const payload = await getPayload({ config })

  const cleanup = async () => {
    console.log(`🧹 Cleaning up test environment: ${testDbName}`)
    
    try {
      // Close Payload connection
      if (payload.db && typeof payload.db.destroy === 'function') {
        await payload.db.destroy()
      }
    } catch (error) {
      console.warn('Failed to close Payload connection:', error)
    }

    // Drop the test database
    const client = new MongoClient(baseUri)
    try {
      await client.connect()
      await client.db(testDbName).dropDatabase()
      console.log(`✅ Dropped test database: ${testDbName}`)
    } catch (error) {
      console.warn(`⚠️ Failed to drop test database ${testDbName}:`, error)
    } finally {
      await client.close()
    }
  }

  return { payload, cleanup }
}

/**
 * Creates an isolated test database and Payload instance with email support
 */
export async function createTestEnvironmentWithEmail(): Promise<{
  payload: Payload
  cleanup: () => Promise<void>
  emailAdapter: EmailTestAdapter
}> {
  const baseUri = process.env.TEST_MONGO_URI
  if (!baseUri) {
    throw new Error('TEST_MONGO_URI not available. Make sure globalSetup is configured.')
  }

  // Create a unique database name for this test environment
  const testDbName = `test_email_${Date.now()}_${Math.random().toString(36).substring(7)}`
  const mongoUri = `${baseUri}${testDbName}?retryWrites=true&w=majority`

  console.log(`🧪 Creating test environment with email support: ${testDbName}`)


  // Initialize email adapter
  const emailAdapter = new EmailTestAdapter()
  await emailAdapter.init()
  const emailAdapterFn = EmailTestAdapter.create(emailAdapter)
  
  // Monkey patch to return our adapter instance
  const originalFn = emailAdapterFn
  const patchedFn = (args?: any) => {
    const result = originalFn(args)
    result.adapter = emailAdapter
    return result
  }

  // Create config with email adapter
  const config = buildConfig({
    admin: {
      user: Users.slug,
      disable: true, // Disable admin UI in tests
    },
    collections,
    editor: lexicalEditor(),
    secret: process.env.PAYLOAD_SECRET || 'test-secret-key',
    typescript: {
      outputFile: path.resolve(__dirname, '../../src/payload-types.ts'),
    },
    db: mongooseAdapter({
      url: mongoUri,
    }),
    email: patchedFn,
  })

  const payload = await getPayload({ config })

  const cleanup = async () => {
    console.log(`🧹 Cleaning up test environment with email: ${testDbName}`)
    
    try {
      // Close Payload connection
      if (payload.db && typeof payload.db.destroy === 'function') {
        await payload.db.destroy()
      }
    } catch (error) {
      console.warn('Failed to close Payload connection:', error)
    }

    // Drop the test database
    const client = new MongoClient(baseUri)
    try {
      await client.connect()
      await client.db(testDbName).dropDatabase()
      console.log(`✅ Dropped test database: ${testDbName}`)
    } catch (error) {
      console.warn(`⚠️ Failed to drop test database ${testDbName}:`, error)
    } finally {
      await client.close()
    }
  }

  return { payload, cleanup, emailAdapter }
}

/**
 * Creates an authenticated request for testing
 */
export async function createAuthenticatedRequest(
  payload: Payload,
  userId: string
): Promise<PayloadRequest> {
  const user = await payload.findByID({
    collection: 'users',
    id: userId,
  })

  return {
    user,
    headers: {},
    payload,
  } as PayloadRequest
}

/**
 * Wait for an email to be captured by the EmailTestAdapter
 */
export async function waitForEmail(
  emailAdapter: EmailTestAdapter,
  timeout: number = 5000
): Promise<void> {
  await emailAdapter.waitForEmail(timeout)
}