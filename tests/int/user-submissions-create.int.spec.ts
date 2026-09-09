/**
 * The unified intake's create path (#723), per type, as an API client actually
 * performs it: write-guard plugin → `enforceSubscribeReach` →
 * `prepareUserSubmission` → field access → the per-type `form` validator.
 *
 * These run with **`overrideAccess: false`** and a real published client, which
 * is the point: `overrideAccess: true` skips field-level access, so a spec using
 * it could not tell a stripped system field from an accepted one.
 *
 * The one external dependency is stubbed: the Turnstile siteverify call.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Client, Form, Manager, UserSubmission } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }))

vi.mock('@/lib/turnstile/verifyTurnstile', () => ({
  verifyTurnstileToken: verifyMock,
}))

const VALID_TURNSTILE = { 'x-turnstile-token': 'tok-valid' }

describe('User submissions intake (POST /api/user-submissions)', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let manager: Manager
  let client: Client
  let otherClient: Client
  let contactForm: Form
  let subscribeForm: Form

  /** A `req` carrying the real published client doc, so access runs for real. */
  const clientReq = (
    as: () => Client,
    headers: Record<string, string> = VALID_TURNSTILE,
  ): PayloadRequest =>
    ({
      payload,
      headers: new Headers(headers),
      user: { ...as(), collection: 'clients' },
      context: {},
    }) as unknown as PayloadRequest

  const send = (
    data: Record<string, unknown>,
    options: { as?: () => Client; headers?: Record<string, string> } = {},
  ) =>
    payload.create({
      collection: 'user-submissions',
      data: data as never,
      overrideAccess: false,
      req: clientReq(options.as ?? (() => client), options.headers ?? VALID_TURNSTILE),
    }) as Promise<UserSubmission>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    manager = await testData.createManager(payload, {
      name: 'Submissions Admin',
      email: 'submissions-admin@example.com',
    })
    client = await testData.createClient(payload, manager.id, {
      name: 'Atlas Widget',
      roles: ['sahaj-atlas-client'],
    })
    otherClient = await testData.createClient(payload, manager.id, {
      name: 'Another Service',
      roles: ['sahaj-atlas-client'],
    })

    contactForm = (await payload.create({
      collection: 'forms',
      data: {
        title: 'Report an issue',
        actionType: 'contact',
        recipient: manager.id,
        // The plugin's `confirmationMessage` is required under the default
        // `message` confirmation type; a redirect sidesteps building Lexical.
        confirmationType: 'redirect',
        redirect: { url: '/thanks' },
        fields: [
          { blockType: 'email', name: 'email', label: 'Email' },
          { blockType: 'textarea', name: 'message', label: 'Message' },
        ],
      } as never,
      overrideAccess: true,
    })) as Form

    subscribeForm = (await payload.create({
      collection: 'forms',
      data: {
        title: 'Newsletter',
        actionType: 'subscribe',
        client: client.id,
        // The plugin's `confirmationMessage` is required under the default
        // `message` confirmation type; a redirect sidesteps building Lexical.
        confirmationType: 'redirect',
        redirect: { url: '/thanks' },
        fields: [{ blockType: 'email', name: 'email', label: 'Email' }],
      } as never,
      overrideAccess: true,
    })) as Form
  })

  afterAll(async () => {
    await cleanup()
  })

  beforeEach(() => {
    // Token-aware, deliberately. A mock that succeeds for any argument makes
    // the "no token" case pass for the wrong reason — it did, until this spec
    // caught it.
    verifyMock
      .mockReset()
      .mockImplementation((token: string) =>
        Promise.resolve(
          token === 'tok-valid' ? { success: true } : { success: false, reason: 'rejected', errorCodes: [] },
        ),
      )
  })

  describe('per-type creates', () => {
    it('accepts a contact submission and returns its uuid', async () => {
      const doc = await send({
        type: 'contact',
        form: contactForm.id,
        senderEmail: 'Reporter@Example.com',
        submissionData: [
          { field: 'message', value: 'The venue for this class closed last month.' },
          { field: 'name', value: 'Ada Reporter' },
        ],
      })

      expect(doc.type).toBe('contact')
      expect(doc.status).toBe('pending')
      expect(doc.uuid).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/))
      // Normalized, because `users` is keyed on the lowercased address and a
      // sender's history has to be one history.
      expect(doc.senderEmail).toBe('reporter@example.com')
      // Composed, not submitted: the form's title leads.
      expect(doc.subject).toContain('Report an issue')
    })

    it('accepts a subscribe submission against its own client’s form', async () => {
      const doc = await send({
        type: 'subscribe',
        form: subscribeForm.id,
        senderEmail: 'subscriber@example.com',
      })

      expect(doc.type).toBe('subscribe')
      expect(doc.status).toBe('pending')
      expect(doc.subject).toBe('subscriber@example.com')
    })

    it('accepts a registration submission, with an event and no form', async () => {
      const event = await testData.createEvent(payload, { manager: manager.id })
      const doc = await send({
        type: 'registration',
        event: event.id,
        senderEmail: 'registrant@example.com',
        startingAt: new Date('2026-10-01T18:00:00.000Z').toISOString(),
        submissionData: [{ field: 'experience', value: 'None yet' }],
      })

      expect(doc.type).toBe('registration')
      expect(doc.uuid).toBeTruthy()
      expect(doc.form).toBeFalsy()
    })

    it('accepts a proposal submission', async () => {
      const doc = await send({
        type: 'proposal',
        senderEmail: 'proposer@example.com',
        proposed: { title: 'A new class in Leeds' },
        submissionData: [{ field: 'note', value: 'We meet every Tuesday.' }],
      })

      expect(doc.type).toBe('proposal')
      expect(doc.subject).toBe('New event proposal')
    })
  })

  describe('the four-state status vocabulary', () => {
    it('starts every type at pending', async () => {
      // One vocabulary for four types is what lets a single screening job, a
      // single delivery queue and a single purge sweep exist at all.
      const doc = await send({
        type: 'contact',
        form: contactForm.id,
        senderEmail: 'status@example.com',
        submissionData: [{ field: 'message', value: 'Checking the status field.' }],
      })
      expect(doc.status).toBe('pending')
    })

    it('refuses a client-forged terminal status', async () => {
      // Field access strips it rather than throwing, so assert the stored
      // value — a spec asserting "does not throw" would pass either way.
      const doc = await send({
        type: 'contact',
        form: contactForm.id,
        status: 'accepted',
        senderEmail: 'forger@example.com',
        submissionData: [{ field: 'message', value: 'Trying to skip screening.' }],
      })
      expect(doc.status).toBe('pending')
    })

    it('refuses a status outside the vocabulary', async () => {
      await expect(
        payload.create({
          collection: 'user-submissions',
          data: {
            type: 'contact',
            form: contactForm.id,
            status: 'delivered',
            senderEmail: 'admin@example.com',
          } as never,
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })
  })

  describe('submissionData bounds', () => {
    it('refuses an unknown key, naming it', async () => {
      await expect(
        send({
          type: 'contact',
          form: contactForm.id,
          senderEmail: 'sneaky@example.com',
          submissionData: [{ field: 'isAdmin', value: 'true' }],
        }),
      ).rejects.toThrow(/isAdmin/)
    })

    it("accepts a key the form's author declared", async () => {
      const form = (await payload.create({
        collection: 'forms',
        data: {
          title: 'Long contact form',
          actionType: 'contact',
          // The plugin's `confirmationMessage` is required under the default
        // `message` confirmation type; a redirect sidesteps building Lexical.
        confirmationType: 'redirect',
        redirect: { url: '/thanks' },
          fields: [
            { blockType: 'email', name: 'email', label: 'Email' },
            { blockType: 'textarea', name: 'message', label: 'Message' },
            { blockType: 'text', name: 'howDidYouHear', label: 'How did you hear?' },
          ],
        } as never,
        overrideAccess: true,
      })) as Form

      const doc = await send({
        type: 'contact',
        form: form.id,
        senderEmail: 'authored@example.com',
        submissionData: [
          { field: 'message', value: 'Hello.' },
          { field: 'howDidYouHear', value: 'A friend' },
        ],
      })
      expect(doc.id).toBeTruthy()
    })

    it('refuses a registration answer on a contact row', async () => {
      // The per-type split, at the boundary: `experience` is a real key, but
      // not one a contact form collects.
      await expect(
        send({
          type: 'contact',
          form: contactForm.id,
          senderEmail: 'crossed@example.com',
          submissionData: [{ field: 'experience', value: 'None yet' }],
        }),
      ).rejects.toThrow(/experience/)
    })

    it('refuses an over-long value', async () => {
      await expect(
        send({
          type: 'contact',
          form: contactForm.id,
          senderEmail: 'verbose@example.com',
          submissionData: [{ field: 'message', value: 'x'.repeat(5001) }],
        }),
      ).rejects.toThrow()
    })

    it('scans the pairs for URLs but exempts the crash-report context', async () => {
      await expect(
        send({
          type: 'contact',
          form: contactForm.id,
          senderEmail: 'spammer@example.com',
          submissionData: [{ field: 'message', value: 'Buy now at https://spam.example' }],
        }),
      ).rejects.toThrow()

      // The other half of the same rule, and the reason it is not a
      // `urlScanFields` entry: an issue report names the page it happened on.
      const doc = await send({
        type: 'contact',
        form: contactForm.id,
        senderEmail: 'reporter2@example.com',
        submissionData: [
          { field: 'message', value: 'The map does not load.' },
          { field: 'hostUrl', value: 'https://example.com/meditation' },
          { field: 'error', value: 'TypeError at https://example.com/assets/embed.js' },
        ],
      })
      expect(doc.id).toBeTruthy()
    })
  })

  describe('the per-type form requirement', () => {
    it('refuses a contact submission with no form', async () => {
      await expect(
        send({
          type: 'contact',
          senderEmail: 'formless@example.com',
          submissionData: [{ field: 'message', value: 'No form named.' }],
        }),
      ).rejects.toThrow()
    })

    it('refuses a registration that names a form', async () => {
      const event = await testData.createEvent(payload, { manager: manager.id })
      await expect(
        send({
          type: 'registration',
          event: event.id,
          form: contactForm.id,
          senderEmail: 'confused@example.com',
        }),
      ).rejects.toThrow()
    })

    it("keeps the plugin's own existence check", async () => {
      // Composed with, not replaced: dropping it would let a submission name a
      // form id that never existed.
      await expect(
        send({
          type: 'contact',
          form: 999_999,
          senderEmail: 'ghost@example.com',
          submissionData: [{ field: 'message', value: 'Pointing at nothing.' }],
        }),
      ).rejects.toThrow()
    })
  })

  describe('subscribe role reach', () => {
    it("refuses an atlas client subscribing against another client's form", async () => {
      await expect(
        send(
          {
            type: 'subscribe',
            form: subscribeForm.id,
            senderEmail: 'poached@example.com',
          },
          { as: () => otherClient },
        ),
      ).rejects.toThrow()
    })
  })

  describe('system fields', () => {
    it('stamps the client from the authenticated key, not the body', async () => {
      const doc = await send({
        type: 'contact',
        form: contactForm.id,
        client: otherClient.id,
        senderEmail: 'attributed@example.com',
        submissionData: [{ field: 'message', value: 'Whose message is this?' }],
      })
      // `payload.create` returns relationships populated, so compare ids.
      expect(typeof doc.client === 'object' ? doc.client?.id : doc.client).toBe(client.id)
    })

    it('upserts one users row across types for one sender', async () => {
      // The whole reason for one table: a sender hitting two intakes is one
      // history, which no per-collection design can express.
      const email = 'repeat@example.com'
      const first = await send({
        type: 'contact',
        form: contactForm.id,
        senderEmail: email,
        submissionData: [{ field: 'message', value: 'First contact.' }],
      })
      const second = await send({
        type: 'proposal',
        senderEmail: email,
        proposed: { title: 'And a proposal' },
      })

      const userId = (doc: UserSubmission) =>
        typeof doc.user === 'object' ? doc.user?.id : doc.user
      expect(userId(first)).toBeTruthy()
      expect(userId(second)).toBe(userId(first))
    })

    it('refuses a client-chosen uuid', async () => {
      const doc = await send({
        type: 'contact',
        form: contactForm.id,
        uuid: 'chosen-by-the-caller',
        senderEmail: 'minter@example.com',
        submissionData: [{ field: 'message', value: 'Minting my own identifier.' }],
      })
      expect(doc.uuid).not.toBe('chosen-by-the-caller')
    })
  })

  describe('the captcha gate', () => {
    it('refuses a create with no Turnstile token', async () => {
      await expect(
        send(
          {
            type: 'contact',
            form: contactForm.id,
            senderEmail: 'tokenless@example.com',
            submissionData: [{ field: 'message', value: 'No token at all.' }],
          },
          { headers: {} },
        ),
      ).rejects.toThrow()
    })

    it('refuses a create Cloudflare rejects', async () => {
      verifyMock.mockResolvedValue({ success: false, reason: 'rejected', errorCodes: [] })

      await expect(
        send({
          type: 'contact',
          form: contactForm.id,
          senderEmail: 'rejected@example.com',
          submissionData: [{ field: 'message', value: 'A forged token.' }],
        }),
      ).rejects.toThrow()
    })
  })
})
