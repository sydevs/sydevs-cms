import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { User } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment, testDataFactory } from '../utils/testHelpers'

describe('Email Configuration (Isolated)', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  it('should have email configuration enabled', async () => {
    // Test that email configuration is properly set up
    expect(payload.config.email).toBeDefined()
    expect(payload.config.email).toBeTruthy()
  })

  it('should use development email settings in test environment', async () => {
    // In test environment, email should be configured
    const emailConfig = payload.config.email as any
    expect(emailConfig).toBeDefined()
    expect(emailConfig.defaultFromAddress).toBeDefined()
    expect(emailConfig.defaultFromName).toBeDefined()
  })

  it('should create user with email field', async () => {
    const user = await testDataFactory.createUser(payload, {
      email: 'emailtest@example.com',
    })

    expect(user).toBeDefined()
    expect(user.email).toBe('emailtest@example.com')
    expect(user.id).toBeDefined()
  })

  it('should have auth configuration enabled with default settings', async () => {
    const usersCollection = payload.collections.users
    expect(usersCollection).toBeDefined()
    expect(usersCollection.config.auth).toBeDefined()
    
    // Check that auth is enabled and uses default configuration
    expect(usersCollection.config.auth).toBe(true)
  })
})