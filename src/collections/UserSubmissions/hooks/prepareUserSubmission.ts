import type { CollectionBeforeValidateHook } from 'payload'

import { randomUUID } from 'node:crypto'

import { APIError, ValidationError } from 'payload'

import { checkNoUrls } from '@/lib/antiSpam/antiSpamGuard'
import { upsertUserByEmail } from '@/lib/users/upsertUserByEmail'
import { relationId } from '@/lib/utilities/relationId'

import {
  allowedSubmissionKeys,
  checkSubmissionData,
  readSubmissionValue,
  urlScannablePairs,
} from '../submissionData'
import { FORM_BACKED_TYPES, TYPE_LABELS, type SubmissionType } from '../types'

/** Said when an address has no usable local part (`"..."@example.org`). */
const FALLBACK_NAME = 'Submitter'

/** How long a composed `subject` may be. Matches the column's `maxLength`. */
const MAX_SUBJECT = 300

/**
 * beforeValidate (create): everything the request itself knows, plus the two
 * things that need the database.
 *
 * **beforeValidate, not beforeChange**, unlike the hooks it replaces. The
 * allowed-key check has to refuse a bad blob with a 400 *at the collection*,
 * and the per-type `form` validator has to see a `type` that is already
 * settled — both run before `beforeChange` would. The write-guard plugin
 * prepends its own `beforeValidate`, so the captcha, URL scan and
 * disposable-email list are already behind us when this runs.
 *
 * What it owns:
 *
 * - **`submissionData` is bounded per type.** The blob is client-writable as
 *   one value, so nothing inside it is protected by field access; the keys a
 *   type accepts are the base context set, the type's own, and whatever the
 *   authored form declares. A rejection names the offending key.
 * - **`uuid` is issued here**, for every type. It was `randomUUID()` inline at
 *   the one endpoint that created a registration, which is why nothing else
 *   could create one — a `required` column with no default and no hook refuses
 *   every writer that forgets it.
 * - **`client` comes from the authenticated key, never the body.** It brands
 *   the emails sent about the submission, so a caller able to set it could
 *   attribute its rows to another service. The field's access already refuses
 *   a client write; this is the positive half of the same rule.
 * - **the sender is upserted into `users`** from the normalized address, for
 *   every type — which is what makes a sender's history one history across all
 *   four intakes, and what `Users.submissions` joins on.
 * - **`subject` is composed**, never taken from the body: it names the row in
 *   the admin list, and a submitter titling their own row would put unreviewed
 *   text there.
 * - **a client-created row always starts at `pending`** (belt-and-braces with
 *   the field-level access lockdown).
 */
export const prepareUserSubmission: CollectionBeforeValidateHook = async ({
  data,
  operation,
  req,
}) => {
  if (!data) return data
  if (operation !== 'create') return data

  const type = (typeof data.type === 'string' ? data.type : 'contact') as SubmissionType
  const fromClient = req.user?.collection === 'clients'

  const formFieldNames = FORM_BACKED_TYPES.includes(type)
    ? await authoredFieldNames(req, data.form)
    : []

  const problems = checkSubmissionData(
    data.submissionData,
    allowedSubmissionKeys(type, formFieldNames),
  )
  if (problems.length > 0) {
    throw new ValidationError({
      collection: 'user-submissions',
      errors: problems.map((message) => ({ path: 'submissionData', message })),
    })
  }

  // The write-guard cannot scan these pairs selectively — see `URL_EXEMPT_KEYS`
  // and the note in `policies.ts`. Same check, same failure shape, so a client
  // sees one contract whichever field tripped it. Client writes only: a manager
  // pasting a link into a triage note is not spam.
  if (fromClient) {
    const urls = checkNoUrls(urlScannablePairs(data.submissionData))
    if (!urls.ok) {
      throw new APIError(urls.message, urls.status, { code: urls.code }, true)
    }
  }

  const senderEmail = typeof data.senderEmail === 'string' ? data.senderEmail.trim() : ''

  // An anonymous submission is allowed — `senderEmail` is optional — and simply
  // carries no user. It is still screened, by the checks that need no identity.
  const user = senderEmail
    ? await upsertUserByEmail({
        req,
        name: readSubmissionValue(data.submissionData, 'name') || displayNameFor(senderEmail),
        email: senderEmail,
      })
    : null

  return {
    ...data,
    type,
    uuid: typeof data.uuid === 'string' && data.uuid ? data.uuid : randomUUID(),
    subject: await composeSubject({ data, req, type }),
    ...(senderEmail ? { senderEmail: senderEmail.toLowerCase() } : {}),
    ...(user != null ? { user } : {}),
    ...(fromClient && req.user?.id != null ? { client: req.user.id } : {}),
    ...(fromClient ? { status: 'pending' } : {}),
  }
}

/**
 * The field names the authored form declares, so `submissionData` accepts what
 * that form actually asks.
 *
 * Read without forwarding `req`. A form is committed state — this never needs
 * the caller's uncommitted writes — and a nested read that joins the caller's
 * transaction takes the whole create down with it when it goes wrong
 * (`src/collections/AGENTS.md`). `disableErrors` keeps a bad `form` id the
 * relationship validator's business, not this hook's.
 */
async function authoredFieldNames(
  req: Parameters<CollectionBeforeValidateHook>[0]['req'],
  form: unknown,
): Promise<string[]> {
  const formId = relationId(form)
  if (formId == null) return []

  const doc = await req.payload
    .findByID({
      collection: 'forms',
      id: formId,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    })
    .catch(() => null)

  if (!doc || !Array.isArray(doc.fields)) return []

  return doc.fields
    .map((block) => (block as { name?: unknown }).name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
}

/**
 * The admin title, per type: a contact row leads with the form that produced
 * it, a registration with the event it attends, a subscription with the address
 * that subscribed, a proposal with what it proposes.
 *
 * The reads drop `req` for the same reason as `authoredFieldNames`, and fall
 * back to the type's label rather than throwing — a title is not worth failing
 * a submission over.
 */
async function composeSubject({
  data,
  req,
  type,
}: {
  data: Record<string, unknown>
  req: Parameters<CollectionBeforeValidateHook>[0]['req']
  type: SubmissionType
}): Promise<string> {
  const sender = typeof data.senderEmail === 'string' ? data.senderEmail.trim() : ''

  if (type === 'subscribe') return truncate(sender || TYPE_LABELS.subscribe)

  if (type === 'contact') {
    const formTitle = await titleOf(req, 'forms', data.form)
    const written = readSubmissionValue(data.submissionData, 'subject')
    const parts = [formTitle, written].filter(Boolean)
    return truncate(parts.length ? parts.join(': ') : TYPE_LABELS.contact)
  }

  const eventTitle = await titleOf(req, 'events', data.event)
  if (type === 'registration') return truncate(eventTitle || TYPE_LABELS.registration)

  // A proposal for a brand-new event has no target to name, so it says so.
  return truncate(eventTitle ? `Update: ${eventTitle}` : 'New event proposal')
}

async function titleOf(
  req: Parameters<CollectionBeforeValidateHook>[0]['req'],
  collection: 'forms' | 'events',
  value: unknown,
): Promise<string> {
  const id = relationId(value)
  if (id == null) return ''

  const doc = await req.payload
    .findByID({
      collection,
      id,
      depth: 0,
      select: { title: true },
      overrideAccess: true,
      disableErrors: true,
    })
    .catch(() => null)

  return typeof doc?.title === 'string' ? doc.title.trim() : ''
}

function truncate(value: string): string {
  return value.length > MAX_SUBJECT ? value.slice(0, MAX_SUBJECT) : value
}

/**
 * A display name for the `users` row when the submission carried none.
 *
 * **Dots and underscores become spaces**, which is both nicer to read
 * (`john.doe` → `john doe`) and load-bearing: the write-guard's `users` policy
 * URL-scans `name`, and its bare-domain pattern matches any `word.tld` — so a
 * literal local part would reject every submission from `foo.com@example.org`
 * with "Links are not allowed in name".
 */
function displayNameFor(email: string): string {
  const localPart = email.split('@')[0] ?? ''
  const name = localPart.replace(/[._]+/g, ' ').trim()
  return name || FALLBACK_NAME
}
