import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Client, User } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Clients Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testUser: User
  let testUser2: User

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test users
    testUser = await payload.create({
      collection: 'users',
      data: {
        email: 'client-manager@example.com',
        password: 'password123',
      },
    }) as User

    testUser2 = await payload.create({
      collection: 'users',
      data: {
        email: 'client-manager2@example.com',
        password: 'password123',
      },
    }) as User
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('CRUD Operations', () => {
    it('creates a client with all required fields', async () => {
      const clientData = {
        name: 'Test Client App',
        description: 'A test client application',
        role: 'full-access',
        managers: [testUser.id],
        primaryContact: testUser.id,
        active: true,
      }

      const client = await payload.create({
        collection: 'clients',
        data: clientData,
      }) as Client

      expect(client).toBeDefined()
      expect(client.name).toBe('Test Client App')
      expect(client.description).toBe('A test client application')
      expect(client.role).toBe('full-access')
      expect(client.active).toBe(true)
      expect(client.managers).toContain(testUser.id)
      expect(client.primaryContact).toBe(testUser.id)
      expect(client.keyGeneratedAt).toBeDefined()
      expect(client.usageStats).toBeDefined()
      expect(client.usageStats.totalRequests).toBe(0)
      expect(client.usageStats.dailyRequests).toBe(0)
    })

    it('enforces primary contact is in managers list', async () => {
      const clientData = {
        name: 'Test Client App 2',
        role: 'full-access',
        managers: [testUser.id],
        primaryContact: testUser2.id, // Different from managers
        active: true,
      }

      const client = await payload.create({
        collection: 'clients',
        data: clientData,
      }) as Client

      // Primary contact should be automatically added to managers
      expect(client.managers).toContain(testUser.id)
      expect(client.managers).toContain(testUser2.id)
      expect(client.primaryContact).toBe(testUser2.id)
    })

    it('updates client information', async () => {
      const client = await payload.create({
        collection: 'clients',
        data: {
          name: 'Update Test Client',
          role: 'full-access',
          managers: [testUser.id],
          primaryContact: testUser.id,
          active: true,
        },
      }) as Client

      const updated = await payload.update({
        collection: 'clients',
        id: client.id,
        data: {
          name: 'Updated Client Name',
          active: false,
        },
      }) as Client

      expect(updated.name).toBe('Updated Client Name')
      expect(updated.active).toBe(false)
    })

    it('deletes a client', async () => {
      const client = await payload.create({
        collection: 'clients',
        data: {
          name: 'Delete Test Client',
          role: 'full-access',
          managers: [testUser.id],
          primaryContact: testUser.id,
          active: true,
        },
      }) as Client

      await payload.delete({
        collection: 'clients',
        id: client.id,
      })

      // Verify deletion
      await expect(
        payload.findByID({
          collection: 'clients',
          id: client.id,
        })
      ).rejects.toThrow()
    })
  })

  describe('Validation', () => {
    it('requires name field', async () => {
      await expect(
        payload.create({
          collection: 'clients',
          data: {
            role: 'full-access',
            managers: [testUser.id],
            primaryContact: testUser.id,
            active: true,
          } as any,
        })
      ).rejects.toThrow()
    })

    it('requires role field', async () => {
      await expect(
        payload.create({
          collection: 'clients',
          data: {
            name: 'Invalid Client',
            managers: [testUser.id],
            primaryContact: testUser.id,
            active: true,
          } as any,
        })
      ).rejects.toThrow()
    })

    it('requires managers field', async () => {
      await expect(
        payload.create({
          collection: 'clients',
          data: {
            name: 'Invalid Client',
            role: 'full-access',
            primaryContact: testUser.id,
            active: true,
          } as any,
        })
      ).rejects.toThrow()
    })

    it('requires primary contact field', async () => {
      await expect(
        payload.create({
          collection: 'clients',
          data: {
            name: 'Invalid Client',
            role: 'full-access',
            managers: [testUser.id],
            active: true,
          } as any,
        })
      ).rejects.toThrow()
    })
  })

  describe('Manager Association', () => {
    it('allows multiple managers', async () => {
      const client = await payload.create({
        collection: 'clients',
        data: {
          name: 'Multi-Manager Client',
          role: 'full-access',
          managers: [testUser.id, testUser2.id],
          primaryContact: testUser.id,
          active: true,
        },
      }) as Client

      expect(client.managers).toHaveLength(2)
      expect(client.managers).toContain(testUser.id)
      expect(client.managers).toContain(testUser2.id)
    })

    it('maintains primary contact relationship', async () => {
      const client = await payload.create({
        collection: 'clients',
        data: {
          name: 'Primary Contact Test',
          role: 'full-access',
          managers: [testUser.id, testUser2.id],
          primaryContact: testUser2.id,
          active: true,
        },
      }) as Client

      expect(client.primaryContact).toBe(testUser2.id)
      expect(client.managers).toContain(testUser2.id)
    })
  })

  describe('Usage Stats', () => {
    it('initializes usage stats on creation', async () => {
      const client = await payload.create({
        collection: 'clients',
        data: {
          name: 'Usage Stats Test',
          role: 'full-access',
          managers: [testUser.id],
          primaryContact: testUser.id,
          active: true,
        },
      }) as Client

      expect(client.usageStats).toBeDefined()
      expect(client.usageStats.totalRequests).toBe(0)
      expect(client.usageStats.dailyRequests).toBe(0)
      expect(client.usageStats.lastResetAt).toBeDefined()
    })
  })
})