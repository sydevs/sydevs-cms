/**
 * `Forms.actionType` and what each action needs from the authored field list
 * (#723).
 *
 * **Save time, not submit time.** A subscribe form with no email field collects
 * nothing a subscription can be made from, and a contact form with no message
 * body collects nothing to deliver. Both fail on every submission, one visitor
 * at a time, with the author never seeing it — so the refusal has to land while
 * the person who can fix it is present.
 *
 * The `emails` cases are here rather than in the unit lane because "the field
 * does not exist" is a fact about the sanitized collection config, which only a
 * booted Payload has.
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Form, Manager } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const EMAIL_FIELD = { blockType: 'email', name: 'email', label: 'Email' }
const MESSAGE_FIELD = { blockType: 'textarea', name: 'message', label: 'Message' }
const STATIC_MESSAGE = { blockType: 'message' }

describe('Forms action types', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let manager: Manager

  const createForm = (data: Record<string, unknown>) =>
    payload.create({
      collection: 'forms',
      data: {
        title: 'A form',
        confirmationType: 'redirect',
        redirect: { url: '/thanks' },
        ...data,
      } as never,
      overrideAccess: true,
    }) as Promise<Form>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    manager = await testData.createManager(payload, {
      name: 'Form Author',
      email: 'form-author@example.com',
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('the authored field list', () => {
    it('saves a contact form with an email and a message field', async () => {
      const form = await createForm({
        actionType: 'contact',
        recipient: manager.id,
        fields: [EMAIL_FIELD, MESSAGE_FIELD],
      })
      expect(form.actionType).toBe('contact')
    })

    it('refuses a subscribe form with no email field', async () => {
      await expect(
        createForm({ actionType: 'subscribe', client: null, fields: [MESSAGE_FIELD] }),
      ).rejects.toThrow()
    })

    it('refuses a contact form with no message field', async () => {
      await expect(
        createForm({ actionType: 'contact', recipient: manager.id, fields: [EMAIL_FIELD] }),
      ).rejects.toThrow()
    })

    it('does not count the static Message block as a message field', async () => {
      // The plugin's `message` block is rich text an author writes, not an
      // input a visitor fills — so a form carrying one still collects nothing.
      await expect(
        createForm({
          actionType: 'contact',
          recipient: manager.id,
          fields: [EMAIL_FIELD, STATIC_MESSAGE],
        }),
      ).rejects.toThrow()
    })
  })

  describe('the conditional fields', () => {
    it('refuses a subscribe form with no client', async () => {
      // Per-action, so it cannot be `required: true` on the field — that would
      // demand a client of every contact form too, and make the column NOT NULL
      // on a table that already has rows.
      await expect(
        createForm({ actionType: 'subscribe', fields: [EMAIL_FIELD] }),
      ).rejects.toThrow()
    })

    it('saves a contact form with no recipient', async () => {
      // Null on purpose: a null recipient falls back to CONTACT_EMAIL, which is
      // how the widget's report-issue path — which has no form at all — keeps
      // working. The two must agree.
      const form = await createForm({
        actionType: 'contact',
        fields: [EMAIL_FIELD, MESSAGE_FIELD],
      })
      expect(form.recipient).toBeFalsy()
    })
  })

  describe('the plugin email feature', () => {
    it('has no `emails` field on the collection at all', () => {
      // Structural, not suppressed: with the field gone nothing can be
      // authored, so the plugin's create-time `sendEmail` has nothing to send
      // and no `beforeEmail` hook silently swallows anybody's message.
      const fields = payload.collections.forms?.config.flattenedFields ?? []
      expect(fields.some((field) => 'name' in field && field.name === 'emails')).toBe(false)
      // Contrast, so this cannot pass on an empty field list.
      expect(fields.some((field) => 'name' in field && field.name === 'actionType')).toBe(true)
    })
  })
})
