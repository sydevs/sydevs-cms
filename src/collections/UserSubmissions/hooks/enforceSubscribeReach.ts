import type { CollectionBeforeValidateHook } from 'payload'

import { APIError } from 'payload'

import { relationId } from '@/lib/utilities/relationId'

/**
 * Client roles whose subscribe submissions may target **any** client's list.
 *
 * The We Meditate apps author and render the forms themselves, so the form they
 * post against is one they chose. The Atlas widget is embedded on sites we do
 * not own, so its key travels further than its authority does — it may only
 * subscribe people to its own list.
 */
const UNRESTRICTED_SUBSCRIBE_ROLES = new Set(['wemeditate-web-client', 'wemeditate-app-client'])

/**
 * beforeValidate: a restricted client may only create a `subscribe` submission
 * against a form whose `client` is itself.
 *
 * **Why this cannot be access control.** The grant is per-row and depends on a
 * value one hop away — the `client` of the `form` the submission names. Payload
 * `create` access answers before the document is resolved, and a `Where` narrows
 * reads, not creates. So the reach check is a hook, and it composes with the
 * create-only grant rather than replacing it.
 *
 * Only `subscribe` is scoped. A contact message is delivered to a recipient the
 * form's author chose, so pointing one at another client's form gains nothing;
 * a subscription writes a person's address into somebody else's mailing list,
 * which is exactly the reach worth bounding.
 */
export const enforceSubscribeReach: CollectionBeforeValidateHook = async ({
  data,
  operation,
  req,
}) => {
  if (!data) return data
  if (operation !== 'create') return data
  if (data.type !== 'subscribe') return data
  if (req.user?.collection !== 'clients') return data

  const roles = Array.isArray((req.user as { roles?: unknown }).roles)
    ? ((req.user as { roles: unknown[] }).roles as string[])
    : []
  if (roles.some((role) => UNRESTRICTED_SUBSCRIBE_ROLES.has(role))) return data

  const formId = relationId(data.form)
  if (formId == null) return data // The `form` validator refuses this first.

  // No `req`: a form is committed state, and a nested read that joins the
  // caller's transaction takes the create down with it if it goes wrong.
  const form = await req.payload
    .findByID({
      collection: 'forms',
      id: formId,
      depth: 0,
      select: { client: true },
      overrideAccess: true,
      disableErrors: true,
    })
    .catch(() => null)

  if (relationId(form?.client) !== req.user.id) {
    throw new APIError(
      'This client may only subscribe people to its own mailing list.',
      403,
      { code: 'subscribe_target_forbidden' },
      true,
    )
  }

  return data
}
