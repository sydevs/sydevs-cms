import type { CollectionBeforeValidateHook } from 'payload'

import { ValidationError } from 'payload'

import type { Form } from '@/payload-types'

/** The plugin's field blocks that can hold an email address a person types. */
const EMAIL_BLOCKS = ['email'] as const

/** The plugin's field blocks that can hold a message body a person types. */
const MESSAGE_BLOCKS = ['textarea', 'text'] as const

type FormBlock = NonNullable<Form['fields']>[number]

function blockTypes(fields: Form['fields']): Set<string> {
  if (!Array.isArray(fields)) return new Set()
  return new Set(fields.map((block: FormBlock) => block.blockType).filter(Boolean))
}

/**
 * What each action needs from the authored field list, and from the form's own
 * configuration.
 *
 * The rule is per-action, so it cannot live on a field: `required: true` on
 * `client` would demand one from a contact form too, and no `validate` on the
 * `fields` blocks array can see `actionType`.
 *
 * **Why save time and not submit time.** A subscribe form with no email field
 * collects nothing a subscription can be made from, and a contact form with no
 * message body collects nothing to deliver. Both fail on every submission,
 * one visitor at a time, with the author never seeing it. Refusing the save is
 * the only moment the person who can fix it is present.
 *
 * Note `message` is *not* a message field: the plugin's `message` block is
 * static rich text the author writes, not an input the visitor fills.
 */
export const validateFormAction: CollectionBeforeValidateHook<Form> = ({ data, originalDoc }) => {
  if (!data) return data

  // A partial update carries only what changed, so read each value from the
  // patch first and fall back to the stored document.
  const actionType = data.actionType ?? originalDoc?.actionType
  const fields = data.fields ?? originalDoc?.fields
  const client = data.client ?? originalDoc?.client

  if (!actionType) return data

  const present = blockTypes(fields)
  const errors: { message: string; path: string }[] = []

  const hasEmail = EMAIL_BLOCKS.some((type) => present.has(type))
  const hasMessage = MESSAGE_BLOCKS.some((type) => present.has(type))

  const missing: string[] = []
  if (!hasEmail) missing.push('an Email field')
  if (actionType === 'contact' && !hasMessage) missing.push('a Text or Textarea field')

  if (missing.length > 0) {
    errors.push({
      path: 'fields',
      message:
        `A ${actionType} form needs ${missing.join(' and ')}. ` +
        'The Message block is static text an author writes, not an input a visitor fills.',
    })
  }

  if (actionType === 'subscribe' && !client) {
    errors.push({
      path: 'client',
      message: 'A subscribe form needs a client, whose mailing list the subscriber joins.',
    })
  }

  if (errors.length > 0) {
    throw new ValidationError({ collection: 'forms', errors })
  }

  return data
}
