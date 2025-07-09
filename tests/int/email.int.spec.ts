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
    // In test environment, should use development email settings (Ethereal)
    const emailConfig = payload.config.email as any
    expect(emailConfig).toBeDefined()
    expect(emailConfig.defaultFromAddress).toBe('dev@sydevelopers.com')
    expect(emailConfig.defaultFromName).toBe('SY Developers (Dev)')
  })

  it('should create user with email field', async () => {
    const user = await testDataFactory.createUser(payload, {
      email: 'emailtest@example.com',
    })

    expect(user).toBeDefined()
    expect(user.email).toBe('emailtest@example.com')
    expect(user.id).toBeDefined()
  })

  it('should have auth configuration for email verification', async () => {
    const usersCollection = payload.collections.users
    expect(usersCollection).toBeDefined()
    expect(usersCollection.config.auth).toBeDefined()
    
    // Check that auth is enabled
    expect(usersCollection.config.auth).toBeTruthy()
    
    // Check that auth configuration has email-related settings
    if (typeof usersCollection.config.auth === 'object') {
      expect(usersCollection.config.auth.verify).toBeDefined()
      expect(usersCollection.config.auth.forgotPassword).toBeDefined()
    }
  })

  it('should have email templates configured for verification', async () => {
    const usersCollection = payload.collections.users
    const authConfig = usersCollection.config.auth as any
    
    expect(authConfig.verify).toBeDefined()
    expect(authConfig.verify.generateEmailHTML).toBeDefined()
    expect(authConfig.verify.generateEmailSubject).toBeDefined()
    expect(typeof authConfig.verify.generateEmailHTML).toBe('function')
    expect(typeof authConfig.verify.generateEmailSubject).toBe('function')
  })

  it('should have email templates configured for password reset', async () => {
    const usersCollection = payload.collections.users
    const authConfig = usersCollection.config.auth as any
    
    expect(authConfig.forgotPassword).toBeDefined()
    expect(authConfig.forgotPassword.generateEmailHTML).toBeDefined()
    expect(authConfig.forgotPassword.generateEmailSubject).toBeDefined()
    expect(typeof authConfig.forgotPassword.generateEmailHTML).toBe('function')
    expect(typeof authConfig.forgotPassword.generateEmailSubject).toBe('function')
  })

  it('should generate correct email verification subject', async () => {
    const usersCollection = payload.collections.users
    const authConfig = usersCollection.config.auth as any
    
    const mockUser = { email: 'test@example.com' }
    const mockReq = {}
    
    const subject = authConfig.verify.generateEmailSubject({ 
      req: mockReq, 
      user: mockUser 
    })
    
    expect(subject).toBe('Verify your email - SY Developers')
  })

  it('should generate correct password reset subject', async () => {
    const usersCollection = payload.collections.users
    const authConfig = usersCollection.config.auth as any
    
    const mockUser = { email: 'test@example.com' }
    const mockReq = {}
    
    const subject = authConfig.forgotPassword.generateEmailSubject({ 
      req: mockReq, 
      user: mockUser 
    })
    
    expect(subject).toBe('Reset your password - SY Developers')
  })

  it('should generate HTML email verification template', async () => {
    const usersCollection = payload.collections.users
    const authConfig = usersCollection.config.auth as any
    
    const mockUser = { email: 'test@example.com' }
    const mockReq = {}
    const mockToken = 'test-token-123'
    
    // Mock NEXT_PUBLIC_SERVER_URL for the test
    process.env.NEXT_PUBLIC_SERVER_URL = 'http://localhost:3000'
    
    const html = authConfig.verify.generateEmailHTML({ 
      req: mockReq, 
      user: mockUser, 
      token: mockToken 
    })
    
    expect(html).toBeDefined()
    expect(typeof html).toBe('string')
    expect(html).toContain('Verify your email address')
    expect(html).toContain('test@example.com')
    expect(html).toContain('test-token-123')
    expect(html).toContain('SY Developers')
    expect(html).toContain('http://localhost:3000/verify-email?token=test-token-123')
  })

  it('should generate HTML password reset template', async () => {
    const usersCollection = payload.collections.users
    const authConfig = usersCollection.config.auth as any
    
    const mockUser = { email: 'test@example.com' }
    const mockReq = {}
    const mockToken = 'reset-token-456'
    
    // Mock NEXT_PUBLIC_SERVER_URL for the test
    process.env.NEXT_PUBLIC_SERVER_URL = 'http://localhost:3000'
    
    const html = authConfig.forgotPassword.generateEmailHTML({ 
      req: mockReq, 
      user: mockUser, 
      token: mockToken 
    })
    
    expect(html).toBeDefined()
    expect(typeof html).toBe('string')
    expect(html).toContain('Reset your password')
    expect(html).toContain('test@example.com')
    expect(html).toContain('reset-token-456')
    expect(html).toContain('SY Developers')
    expect(html).toContain('http://localhost:3000/reset-password?token=reset-token-456')
  })
})