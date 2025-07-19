import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest'
import type { User } from '@/payload-types'
import type { Payload } from 'payload'
import { EmailTestAdapter } from '../utils/emailTestAdapter'
import { testDataFactory } from '../utils/testDataFactory'
import { createTestEnvironmentWithEmail } from 'tests/utils/testHelpers'

describe('Email Sending', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let emailAdapter: EmailTestAdapter

  beforeAll(async () => {
    const testEnv = await createTestEnvironmentWithEmail()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    emailAdapter = testEnv.emailAdapter
  })

  afterAll(async () => {
    await cleanup()
  })

  beforeEach(() => {
    // Clear captured emails before each test
    emailAdapter.clearCapturedEmails()
  })

  describe('User System', () => {
    it('should send verification email when user is created', async () => {
      const userData = {
        email: 'verify@test.com',
        password: 'TestPassword123!',
      }

      // Clear any existing emails
      emailAdapter.clearCapturedEmails()

      // Create user
      const user = await payload.create({
        collection: 'users',
        data: userData,
      }) as User

      expect(user.email).toBe(userData.email)

      // Check email was sent and captured by Ethereal
      const emails = emailAdapter.getCapturedEmails()
      expect(emails).toHaveLength(1)
      
      const verificationEmail = emails[0]
      expect(verificationEmail.to).toContain(userData.email)
      expect(verificationEmail.subject).toBeTruthy()
      
      console.log('Verification email captured by Ethereal:', emailAdapter.account.web)
    })
    
    it('should send password reset email when requested', async () => {
      const email = "password-reset@example.com"
      await testDataFactory.createUser(payload, { email })

      // Wait for and clear verification email from user creation
      await new Promise(resolve => setTimeout(resolve, 1000))
      emailAdapter.clearCapturedEmails()

      // Request password reset
      await payload.forgotPassword({
        collection: 'users',
        data: {
          email: email,
        },
        disableEmail: false,
      })

      // Wait for password reset email
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Check password reset email was sent and captured by Ethereal
      const emails = emailAdapter.getCapturedEmails()
      expect(emails).toHaveLength(1)
      
      const resetEmail = emails[0]
      expect(resetEmail.to).toContain(email)
      expect(resetEmail.subject).toBe('Reset Your Password')
      
      console.log('Password reset email captured by Ethereal:', emailAdapter.account.web)
    })

    it('should not send password reset email for non-existent user', async () => {
      // Clear any existing emails
      emailAdapter.clearCapturedEmails()

      // Try to reset password for non-existent user
      await payload.forgotPassword({
        collection: 'users',
        data: {
          email: 'nonexistent@test.com',
        },
        disableEmail: false,
      })

      // Wait a bit to ensure no email is sent
      await new Promise(resolve => setTimeout(resolve, 1000))

      // No email should be sent for non-existent users
      expect(emailAdapter.getCapturedEmails()).toHaveLength(0)
    })
  })

  describe('Email Content Verification', () => {
    it('should send emails with proper content structure', async () => {
      // Clear any existing emails
      emailAdapter.clearCapturedEmails()

      // Create user
      const emailAddress = "content-check@example.com"
      await testDataFactory.createUser(payload, { email: emailAddress })

      // Wait for email to be sent
      await new Promise(resolve => setTimeout(resolve, 1000))
      const email = emailAdapter.getLatestEmail()
      
      // Verify email structure
      expect(email).toBeDefined()
      expect(email?.to).toContain(emailAddress)
      expect(email?.from).toBeTruthy()
      expect(email?.subject).toBeTruthy()
      expect(email?.html || email?.text).toBeTruthy()
      
      // Verify Ethereal captured the email
      expect(emailAdapter.account.web).toBeTruthy()
      console.log('Email successfully captured by Ethereal')
    })
  })
})