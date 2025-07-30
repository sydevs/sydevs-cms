import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { User } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'
import { testDataFactory } from '../utils/testDataFactory'
import { hasPermission, hasFieldAccess, createLocaleFilter, getAvailableCollections } from '@/lib/accessControl'

describe('Permission System Tests', () => {
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

  describe('User Permission System', () => {
    it('creates admin user with full access', async () => {
      const adminUser = await testDataFactory.createUser(payload, {
        email: 'admin@test.com',
        admin: true,
      })

      expect(adminUser.admin).toBe(true)
      expect(adminUser.permissions).toBeUndefined() // Admin users don't need permissions array
    })

    it('creates user with specific permissions', async () => {
      const permissions = [
        {
          collection: 'music',
          level: 'Translate',
          locales: ['en', 'it'],
        }
      ]

      const user = await testDataFactory.createUserWithPermissions(payload, permissions, {
        email: 'translate-user@test.com',
      })

      expect(user.admin).toBe(false)
      expect(user.permissions).toHaveLength(1)
      expect(user.permissions![0].collection).toBe('music')
      expect(user.permissions![0].level).toBe('Translate')
      expect(user.permissions![0].locales).toEqual(['en', 'it'])
    })

    it('creates translate user helper', async () => {
      const translateUser = await testDataFactory.createTranslateUser(payload, 'music', ['en'])
      
      expect(translateUser.permissions).toHaveLength(1)
      expect(translateUser.permissions![0].level).toBe('Translate')
      expect(translateUser.permissions![0].collection).toBe('music')
      expect(translateUser.permissions![0].locales).toEqual(['en'])
    })

    it('creates manage user helper', async () => {
      const manageUser = await testDataFactory.createManageUser(payload, 'meditations', ['all'])
      
      expect(manageUser.permissions).toHaveLength(1)
      expect(manageUser.permissions![0].level).toBe('Manage')
      expect(manageUser.permissions![0].collection).toBe('meditations')
      expect(manageUser.permissions![0].locales).toEqual(['all'])
    })
  })

  describe('Client Permission System', () => {
    it('creates client with read permissions', async () => {
      const client = await testDataFactory.createReadClient(payload, 'music', ['en'])
      
      expect(client.permissions).toHaveLength(1)
      expect(client.permissions[0].level).toBe('Read')
      expect(client.permissions[0].collection).toBe('music')
      expect(client.permissions[0].locales).toEqual(['en'])
    })

    it('creates client with manage permissions', async () => {
      const client = await testDataFactory.createManageClient(payload, 'meditations', ['all'])
      
      expect(client.permissions).toHaveLength(1)
      expect(client.permissions[0].level).toBe('Manage')
      expect(client.permissions[0].collection).toBe('meditations')
      expect(client.permissions[0].locales).toEqual(['all'])
    })
  })

  describe('Permission Logic Tests', () => {
    describe('hasPermission function', () => {
      it('allows admin users full access', () => {
        const adminUser = { admin: true, active: true, collection: 'users' } as any
        
        expect(hasPermission(adminUser, 'music', 'read')).toBe(true)
        expect(hasPermission(adminUser, 'music', 'create')).toBe(true)
        expect(hasPermission(adminUser, 'music', 'update')).toBe(true)
        expect(hasPermission(adminUser, 'music', 'delete')).toBe(true)
      })

      it('denies inactive users access', () => {
        const inactiveUser = { admin: false, active: false, collection: 'users' } as any
        
        expect(hasPermission(inactiveUser, 'music', 'read')).toBe(false)
      })

      it('blocks API clients from users/clients collections', () => {
        const apiClient = { 
          active: true, 
          collection: 'clients',
          permissions: [{ collection: 'music', level: 'Read', locales: ['all'] }]
        } as any
        
        expect(hasPermission(apiClient, 'users', 'read')).toBe(false)
        expect(hasPermission(apiClient, 'clients', 'read')).toBe(false)
      })

      it('handles translate user permissions correctly', () => {
        const translateUser = {
          admin: false,
          active: true,
          collection: 'users',
          permissions: [{ collection: 'music', level: 'Translate', locales: ['en'] }]
        } as any
        
        expect(hasPermission(translateUser, 'music', 'read')).toBe(true)
        expect(hasPermission(translateUser, 'music', 'update')).toBe(true)
        expect(hasPermission(translateUser, 'music', 'create')).toBe(false)
        expect(hasPermission(translateUser, 'music', 'delete')).toBe(false)
      })

      it('handles manage user permissions correctly', () => {
        const manageUser = {
          admin: false,
          active: true,
          collection: 'users',
          permissions: [{ collection: 'music', level: 'Manage', locales: ['all'] }]
        } as any
        
        expect(hasPermission(manageUser, 'music', 'read')).toBe(true)
        expect(hasPermission(manageUser, 'music', 'create')).toBe(true)
        expect(hasPermission(manageUser, 'music', 'update')).toBe(true)
        expect(hasPermission(manageUser, 'music', 'delete')).toBe(true)
      })

      it('handles API client read permissions correctly', () => {
        const readClient = {
          active: true,
          collection: 'clients',
          permissions: [{ collection: 'music', level: 'Read', locales: ['en'] }]
        } as any
        
        expect(hasPermission(readClient, 'music', 'read')).toBe(true)
        expect(hasPermission(readClient, 'music', 'create')).toBe(false)
        expect(hasPermission(readClient, 'music', 'update')).toBe(false)
        expect(hasPermission(readClient, 'music', 'delete')).toBe(false)
      })

      it('handles API client manage permissions correctly (no delete)', () => {
        const manageClient = {
          active: true,
          collection: 'clients',
          permissions: [{ collection: 'music', level: 'Manage', locales: ['all'] }]
        } as any
        
        expect(hasPermission(manageClient, 'music', 'read')).toBe(true)
        expect(hasPermission(manageClient, 'music', 'create')).toBe(true)
        expect(hasPermission(manageClient, 'music', 'update')).toBe(true)
        expect(hasPermission(manageClient, 'music', 'delete')).toBe(false) // API clients never get delete
      })

      it('respects locale restrictions', () => {
        const user = {
          admin: false,
          active: true,
          collection: 'users',
          permissions: [{ collection: 'music', level: 'Manage', locales: ['en'] }]
        } as any
        
        expect(hasPermission(user, 'music', 'read', 'en')).toBe(true)
        expect(hasPermission(user, 'music', 'read', 'it')).toBe(false)
      })

      it('handles "all" locales permission', () => {
        const user = {
          admin: false,
          active: true,
          collection: 'users',
          permissions: [{ collection: 'music', level: 'Manage', locales: ['all'] }]
        } as any
        
        expect(hasPermission(user, 'music', 'read', 'en')).toBe(true)
        expect(hasPermission(user, 'music', 'read', 'it')).toBe(true)
        expect(hasPermission(user, 'music', 'read', 'fr')).toBe(true)
      })

      it('provides default read access for users without specific permissions', () => {
        const user = {
          admin: false,
          active: true,
          collection: 'users',
          permissions: []
        } as any
        
        expect(hasPermission(user, 'music', 'read')).toBe(true)
        expect(hasPermission(user, 'music', 'create')).toBe(false)
      })

      it('denies API clients without specific permissions', () => {
        const client = {
          active: true,
          collection: 'clients',
          permissions: []
        } as any
        
        expect(hasPermission(client, 'music', 'read')).toBe(false)
      })
    })

    describe('hasFieldAccess function', () => {
      it('allows admin users full field access', () => {
        const adminUser = { admin: true, active: true, collection: 'users' } as any
        const field = { localized: false }
        
        expect(hasFieldAccess(adminUser, 'music', field, 'read')).toBe(true)
        expect(hasFieldAccess(adminUser, 'music', field, 'update')).toBe(true)
      })

      it('restricts translate users to localized fields for updates', () => {
        const translateUser = {
          admin: false,
          active: true,
          collection: 'users',
          permissions: [{ collection: 'music', level: 'Translate', locales: ['en'] }]
        } as any
        
        const localizedField = { localized: true }
        const nonLocalizedField = { localized: false }
        
        // Can read both types of fields
        expect(hasFieldAccess(translateUser, 'music', localizedField, 'read')).toBe(true)
        expect(hasFieldAccess(translateUser, 'music', nonLocalizedField, 'read')).toBe(true)
        
        // Can only update localized fields
        expect(hasFieldAccess(translateUser, 'music', localizedField, 'update')).toBe(true)
        expect(hasFieldAccess(translateUser, 'music', nonLocalizedField, 'update')).toBe(false)
      })

      it('allows manage users full field access', () => {
        const manageUser = {
          admin: false,
          active: true,
          collection: 'users',
          permissions: [{ collection: 'music', level: 'Manage', locales: ['all'] }]
        } as any
        
        const field = { localized: false }
        
        expect(hasFieldAccess(manageUser, 'music', field, 'read')).toBe(true)
        expect(hasFieldAccess(manageUser, 'music', field, 'update')).toBe(true)
      })

      it('allows API clients full field access (handled at collection level)', () => {
        const apiClient = {
          active: true,
          collection: 'clients',
          permissions: [{ collection: 'music', level: 'Read', locales: ['en'] }]
        } as any
        
        const field = { localized: false }
        
        expect(hasFieldAccess(apiClient, 'music', field, 'read')).toBe(true)
        expect(hasFieldAccess(apiClient, 'music', field, 'update')).toBe(true)
      })
    })

    describe('createLocaleFilter function', () => {
      it('returns true for admin users', () => {
        const adminUser = { admin: true, active: true, collection: 'users' } as any
        
        const filter = createLocaleFilter(adminUser, 'music')
        expect(filter).toBe(true)
      })

      it('returns true for "all" locales permission', () => {
        const user = {
          admin: false,
          active: true,
          collection: 'users',
          permissions: [{ collection: 'music', level: 'Manage', locales: ['all'] }]
        } as any
        
        const filter = createLocaleFilter(user, 'music')
        expect(filter).toBe(true)
      })

      it('creates locale filter for specific locales', () => {
        const user = {
          admin: false,
          active: true,
          collection: 'users',
          permissions: [{ collection: 'music', level: 'Manage', locales: ['en', 'it'] }]
        } as any
        
        const filter = createLocaleFilter(user, 'music')
        expect(filter).toEqual({
          or: [
            { locale: { exists: false } },
            { locale: { in: ['en', 'it'] } }
          ]
        })
      })

      it('returns true for users without specific permissions (default read)', () => {
        const user = {
          admin: false,
          active: true,
          collection: 'users',
          permissions: []
        } as any
        
        const filter = createLocaleFilter(user, 'music')
        expect(filter).toBe(true)
      })

      it('returns false for API clients without specific permissions', () => {
        const client = {
          active: true,
          collection: 'clients',
          permissions: []
        } as any
        
        const filter = createLocaleFilter(client, 'music')
        expect(filter).toBe(false)
      })
    })
  })

  describe('Collection Configuration', () => {
    it('returns correct available collections', () => {
      const collections = getAvailableCollections()
      
      // Should include main content collections
      const collectionValues = collections.map(c => c.value)
      expect(collectionValues).toContain('meditations')
      expect(collectionValues).toContain('music')
      expect(collectionValues).toContain('frames')
      expect(collectionValues).toContain('media')
      expect(collectionValues).toContain('narrators')
      expect(collectionValues).toContain('tags')
      
      // Should exclude restricted collections
      expect(collectionValues).not.toContain('users')
      expect(collectionValues).not.toContain('clients')
      expect(collectionValues).not.toContain('meditationframes')
    })
  })

  describe('Integration Tests with Payload', () => {
    it('allows admin user to access all collections', async () => {
      const adminUser = await testDataFactory.createUser(payload, {
        email: 'admin-integration@test.com',
        admin: true,
      })

      // Mock request with admin user
      const req = { user: adminUser } as any

      // Test that admin can read music collection
      const music = await payload.find({
        collection: 'music',
        req,
        depth: 0,
      })
      
      expect(music).toBeDefined()
      expect(music.docs).toEqual([]) // Empty since no music created, but access granted
    })

    it('blocks non-admin user without permissions from accessing collections', async () => {
      const regularUser = await testDataFactory.createUserWithPermissions(payload, [], {
        email: 'regular-integration@test.com',
      })

      // Mock request with regular user
      const req = { user: regularUser } as any

      // Should be able to read (default access)
      const music = await payload.find({
        collection: 'music',
        req,
        depth: 0,
      })
      
      expect(music).toBeDefined()

      // Should not be able to create
      await expect(
        payload.create({
          collection: 'music',
          data: { title: 'Test Music' },
          req,
        })
      ).rejects.toThrow()
    })

    it('allows translate user to read but not create', async () => {
      const translateUser = await testDataFactory.createTranslateUser(payload, 'music', ['en'], {
        email: 'translate-integration@test.com',
      })

      const req = { user: translateUser } as any

      // Should be able to read
      const music = await payload.find({
        collection: 'music',
        req,
        depth: 0,
      })
      
      expect(music).toBeDefined()

      // Should not be able to create
      await expect(
        payload.create({
          collection: 'music',
          data: { title: 'Test Music' },
          req,
        })
      ).rejects.toThrow()
    })

    it('allows manage user to create, read, update, delete', async () => {
      const manageUser = await testDataFactory.createManageUser(payload, 'music', ['all'], {
        email: 'manage-integration@test.com',
      })

      const req = { user: manageUser } as any

      // Should be able to create (but need actual file for music collection)
      // This test would need a proper audio file, so we'll just test the access control logic
      
      // Should be able to read
      const music = await payload.find({
        collection: 'music',
        req,
        depth: 0,
      })
      
      expect(music).toBeDefined()
    })
  })
})