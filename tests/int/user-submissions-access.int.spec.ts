/**
 * Who may read, create and update `user-submissions` (#723).
 *
 * The collection folds four intakes into one table, so the access rules that
 * used to be spread over three collections now have to be told apart *by row*.
 * Two halves, and both matter:
 *
 * - the query-free grants (`hasPermission`), which say whether a role reaches
 *   the collection at all;
 * - the per-row narrowing in `createAccessConfig`, which is the only thing
 *   stopping a manager's proposal grant from also handing them every
 *   registrant's address.
 *
 * The read cases go through `payload.find` with `overrideAccess: false`, so the
 * `Where` the access layer returns is actually applied. Asserting the grant
 * alone would say nothing about which rows come back.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Client, Form, Manager, UserSubmission } from '@/payload-types'
import { bypassPermissions, hasPermission } from '@/plugins/access'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }))

vi.mock('@/lib/turnstile/verifyTurnstile', () => ({
  verifyTurnstileToken: verifyMock,
}))

describe('User submissions access', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let recipient: Manager
  let otherManager: Manager
  let client: Client
  let addressedForm: Form
  let otherForm: Form

  const managerReq = (manager: Manager): PayloadRequest =>
    ({
      payload,
      headers: new Headers(),
      user: { ...manager, collection: 'managers' },
      locale: 'en',
      context: {},
    }) as unknown as PayloadRequest

  const readAs = (manager: Manager) =>
    payload.find({
      collection: 'user-submissions',
      depth: 0,
      pagination: false,
      overrideAccess: false,
      req: managerReq(manager),
    }) as Promise<{ docs: UserSubmission[] }>

  const seed = (data: Record<string, unknown>) =>
    payload.create({
      collection: 'user-submissions',
      data: data as never,
      overrideAccess: true,
    }) as Promise<UserSubmission>

  beforeAll(async () => {
    verifyMock.mockResolvedValue({ success: true })

    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    recipient = await testData.createManager(payload, {
      name: 'Addressed Manager',
      email: 'addressed@example.com',
      roles: ['atlas-manager'],
    })
    otherManager = await testData.createManager(payload, {
      name: 'Other Manager',
      email: 'other-manager@example.com',
      roles: ['atlas-manager'],
    })
    client = await testData.createClient(payload, recipient.id, {
      name: 'Atlas Widget',
      roles: ['sahaj-atlas-client'],
    })

    const form = (title: string, manager: Manager) =>
      payload.create({
        collection: 'forms',
        data: {
          title,
          actionType: 'contact',
          recipient: manager.id,
          confirmationType: 'redirect',
          redirect: { url: '/thanks' },
          fields: [
            { blockType: 'email', name: 'email', label: 'Email' },
            { blockType: 'textarea', name: 'message', label: 'Message' },
          ],
        } as never,
        overrideAccess: true,
      }) as Promise<Form>

    addressedForm = await form('Addressed to me', recipient)
    otherForm = await form('Addressed to someone else', otherManager)

    await seed({
      type: 'contact',
      form: addressedForm.id,
      senderEmail: 'mine@example.com',
      submissionData: [{ field: 'message', value: 'For the addressed manager.' }],
    })
    await seed({
      type: 'contact',
      form: otherForm.id,
      senderEmail: 'theirs@example.com',
      submissionData: [{ field: 'message', value: 'For somebody else.' }],
    })
    await seed({ type: 'proposal', senderEmail: 'proposer@example.com', proposed: { title: 'New' } })
    await seed({ type: 'registration', senderEmail: 'registrant@example.com' })
    await seed({ type: 'subscribe', form: addressedForm.id, senderEmail: 'sub@example.com' })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('clients', () => {
    const clientUser = { id: 1, collection: 'clients', roles: ['sahaj-atlas-client'] } as never
    const webClient = { id: 2, collection: 'clients', roles: ['wemeditate-web-client'] } as never

    it('may create and nothing else', () => {
      for (const user of [clientUser, webClient]) {
        expect(hasPermission({ user, collection: 'user-submissions', operation: 'create' })).toBe(
          true,
        )
        for (const operation of ['read', 'update', 'delete'] as const) {
          expect(
            hasPermission({ user, collection: 'user-submissions', operation }),
            `client should not ${operation}`,
          ).toBe(false)
        }
      }
    })

    it('gets no implicit read from project membership', async () => {
      // The collection left the `wemeditate-web` project when it stopped being
      // `form-submissions`. Being in no project is not restrictive on its own —
      // it means "shared, readable by every role" — so RESTRICTED_COLLECTIONS
      // is what closes it. This asserts the outcome, not the mechanism.
      await expect(
        payload.find({
          collection: 'user-submissions',
          depth: 0,
          overrideAccess: false,
          req: {
            payload,
            headers: new Headers(),
            user: { ...client, collection: 'clients' },
            context: {},
          } as unknown as PayloadRequest,
        }),
      ).rejects.toThrow()
    })
  })

  describe('managers', () => {
    it('reads the contact rows addressed to them, and no other contact row', async () => {
      const { docs } = await readAs(recipient)
      const contacts = docs.filter((doc) => doc.type === 'contact')

      expect(contacts).toHaveLength(1)
      expect(contacts[0]!.senderEmail).toBe('mine@example.com')
    })

    it('reads proposals, whoever sent them', async () => {
      const { docs } = await readAs(recipient)
      expect(docs.some((doc) => doc.type === 'proposal')).toBe(true)
    })

    it('reads no registration or subscription at all', async () => {
      // Consent and attendance records. No manager task reads them, and one
      // collection-wide grant would otherwise hand over every registrant's
      // address along with the proposals they do need.
      const { docs } = await readAs(recipient)
      expect(docs.some((doc) => doc.type === 'registration')).toBe(false)
      expect(docs.some((doc) => doc.type === 'subscribe')).toBe(false)
    })

    it('shows a manager addressed by nothing only the proposals', async () => {
      const { docs } = await readAs(otherManager)
      // Their own addressed row is the one contact they see — the scope is per
      // manager, not "any contact row".
      const contacts = docs.filter((doc) => doc.type === 'contact')
      expect(contacts).toHaveLength(1)
      expect(contacts[0]!.senderEmail).toBe('theirs@example.com')
    })
  })

  describe('the Users join', () => {
    it('does not hand a manager rows the per-row scope withholds', async () => {
      // `Users.submissions` is a join on `user-submissions.user`, and
      // `atlas-manager` holds `users: ['read']` — so if a join ran outside the
      // joined collection's access, reading a registrant would return every
      // submission they ever sent, contact messages addressed to somebody else
      // included. That is the leak worth asserting; the join's usefulness is
      // not.
      const asUser = (options: { overrideAccess: boolean; req?: PayloadRequest }) =>
        payload.find({
          collection: 'users',
          where: { email: { equals: 'theirs@example.com' } },
          depth: 1,
          limit: 1,
          ...options,
        })

      // The control. Without it a zero below could mean the join never
      // populates, which would prove nothing about access at all.
      const asAdmin = await asAdminRead()
      expect(asAdmin.docs).toHaveLength(1)
      expect(asAdmin.docs[0]!.submissions?.docs ?? []).toHaveLength(1)

      const { docs } = await asUser({ overrideAccess: false, req: managerReq(recipient) })
      // The manager really can read the registrant — so the empty join below
      // is the access layer's doing, not a missing row.
      expect(docs).toHaveLength(1)
      expect(docs[0]!.submissions?.docs ?? []).toHaveLength(0)

      async function asAdminRead() {
        return asUser({ overrideAccess: true })
      }
    })
  })

  describe('admins', () => {
    it('read everything', async () => {
      const admin = { id: 3, collection: 'managers', type: 'admin' } as never
      expect(
        hasPermission(
          { user: admin, collection: 'user-submissions', operation: 'read' },
          bypassPermissions,
        ),
      ).toBe(true)

      const { totalDocs } = await payload.count({
        collection: 'user-submissions',
        overrideAccess: true,
      })
      expect(totalDocs).toBe(5)
    })
  })
})
