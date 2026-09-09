import type { Plugin } from 'payload'

import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'

import { formFields } from '@/collections/Forms/fields'
import { validateFormAction } from '@/collections/Forms/hooks/validateFormAction'
import { userSubmissionFields } from '@/collections/UserSubmissions/fields'
import { enforceSubscribeReach } from '@/collections/UserSubmissions/hooks/enforceSubscribeReach'
import { prepareUserSubmission } from '@/collections/UserSubmissions/hooks/prepareUserSubmission'
import { CONTACT_EMAIL } from '@/lib/contact'

/**
 * The form-builder plugin, configured once.
 *
 * **One definition, shared with the test harness**, which builds its own
 * Payload config (`tests/utils/testHelpers.ts`) — a plugin configured in only
 * one of the two behaves differently under test than in production, which is
 * the trap `REGION_NESTED_DOCS_CONFIG` exists to avoid for nested-docs.
 *
 * Two things it does beyond registering the plugin:
 *
 * - **The submissions collection is renamed `user-submissions`** (#723). It is
 *   the one intake for every public write — contact, subscribe, registration,
 *   proposal — and not every one of those comes from an authored form, which is
 *   why the plugin's own name no longer fits. See
 *   `src/collections/UserSubmissions/`.
 * - **`formOverrides.fields` strips the plugin's `emails` array**, which
 *   structurally disables its create-time `sendEmail` hook: with no `emails` on
 *   the form, that hook takes its explicit "nothing to send" branch. A
 *   `beforeEmail` suppression would have silently swallowed a message somebody
 *   authored; removing the field means nothing can be authored in the first
 *   place. All delivery belongs to the queue (#695 Phase 2).
 *
 * ⚠ Register it **before** `accessPlugin`, which must be last so it sees the
 * collections this creates.
 */
export const formsPlugin = (): Plugin => async (config) => {
  const withForms = await formBuilder(config)

  return {
    ...withForms,
    collections: withForms.collections?.map((collection) =>
      collection.slug === 'user-submissions'
        ? { ...collection, access: {}, hooks: { ...collection.hooks, afterChange: [] } }
        : collection,
    ),
  }
}

/**
 * ⚠ **The plugin's own `access` block is cleared above, and without that every
 * access rule this repo writes for `user-submissions` is decorative.**
 *
 * `accessPlugin` composes `{ ...createAccessConfig(slug, …), ...collection.access }`
 * — a collection's own `access` wins, by design, so a hand-written override is
 * never clobbered. The form-builder plugin always supplies one
 * (`read: ({ req: { user } }) => !!user`), which is not an override anybody
 * chose here: it grants read to **any authenticated user, every API client
 * included**. Left in place it outranks the role table, the per-row manager
 * scope, and `RESTRICTED_COLLECTIONS` alike, on a table of unscreened stranger
 * messages and registrant addresses. `access: {}` hands the collection back to
 * RBAC. `tests/int/user-submissions-access.int.spec.ts` reads rows back through
 * `overrideAccess: false` rather than asserting the grants, which is what
 * catches this.
 *
 * `forms` keeps its plugin `access` (`read: () => true`): a public site renders
 * a form anonymously, so that one IS the intended rule.
 *
 * ⚠ The plugin's `sendEmail` afterChange hook is removed above, and stripping
 * `emails` is not enough on its own.
 *
 * That hook runs on **every** create, ahead of anything this repo registers,
 * and its first act is to load `data.form` and spread `data.submissionData`.
 * Both are optional here — a registration or proposal names an event and no
 * form — so on two of the four types it throws, is caught by its own handler,
 * and logs `Error while sending one or more emails` once per submission. It
 * would also cost a `forms` lookup per create for a feature that is off.
 *
 * Nothing is swallowed by removing it. `emails` does not exist on `forms`, so
 * no email can be authored, so there is provably nothing for it to send — the
 * concern behind "never suppress with `beforeEmail`" is a message somebody
 * wrote going missing, and none can be written. Delivery belongs to the queue.
 */
const formBuilder = (config: Parameters<Plugin>[0]) =>
  formBuilderPlugin({
    defaultToEmail: CONTACT_EMAIL,
    formOverrides: {
      admin: { group: 'Content', enableRichTextRelationship: true },
      fields: formFields,
      hooks: { beforeValidate: [validateFormAction] },
    },
    formSubmissionOverrides: {
      slug: 'user-submissions',
      labels: { singular: 'User Submission', plural: 'User Submissions' },
      admin: {
        group: 'System',
        useAsTitle: 'subject',
        defaultColumns: ['subject', 'type', 'status', 'senderEmail', 'createdAt'],
      },
      fields: userSubmissionFields,
      // Order matters: the reach check refuses a forbidden target before
      // `prepareUserSubmission` upserts a `users` row for its sender.
      hooks: { beforeValidate: [enforceSubscribeReach, prepareUserSubmission] },
    },
  })(config)
