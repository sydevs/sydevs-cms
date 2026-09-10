import type { JSONSchema4 } from 'json-schema'

/**
 * What screening recorded about a submission — one shape for all four types.
 *
 * A leaf module, for the same reason as the two per-collection files it
 * replaces: the (Phase 2) job writes this shape and the admin banner renders
 * it, and neither imports the other.
 *
 * **This column, not `status`, is where the machine verdict lives.** The four
 * shared statuses fold a spam verdict and a human decline into one `rejected`,
 * which is what lets every type share a vocabulary — so abuse counting reads
 * `screeningResult.verdict` and never `status`, and a manager declining a
 * proposal is not a spam strike against its sender.
 */

/**
 * Why a submission was refused, or `ok`. One reason — the first check that hit.
 *
 * The union of what the two screening jobs recorded separately, minus the
 * per-collection wording: the copy that made them un-shareable lived in the
 * notes, and the notes are composed by the job, which knows the domain.
 *
 * A runtime list as well as a type, because the verdict is read back out of a
 * JSON column — a value outside this list means the column holds something this
 * code did not write.
 */
export const SUBMISSION_VERDICTS = [
  'ok',
  'disposable_email',
  'invalid_email',
  'no_mx_records',
  'repeat_sender',
  'duplicate_body',
  'content_rejected',
] as const

export type SubmissionVerdict = (typeof SUBMISSION_VERDICTS)[number]

/**
 * JSON Schema for the stored `screeningResult`. Payload generates the type from
 * it **and** compiles it to a write-time validator, so the shape has one
 * definition rather than a hand-kept alias beside a column that took anything.
 *
 * Closed (`additionalProperties: false`) because only the screening job writes
 * here — an unknown key is a bug in the job, never an older server meeting a
 * newer client. Nothing has been written under an earlier shape, because the
 * column is new.
 */
export const screeningResultJsonSchema: JSONSchema4 = {
  $id: 'urn:sahajcloud:schema:submission-screening-result',
  title: 'SubmissionScreeningResult',
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'screenedAt'],
  properties: {
    // `description`, not a `//` comment: Payload renders these into the JSDoc on
    // the generated type.
    verdict: {
      enum: [...SUBMISSION_VERDICTS],
      description: '`ok`, or the first check that refused this submission.',
    },
    notes: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Everything an admin needs, as complete sentences: what happened and what follows from it. An accepted submission normally has none.',
    },
    diagnostic: {
      type: 'string',
      description:
        'A technical detail kept for triage and NOT rendered — an inconclusive MX lookup, or a transport’s own error string.',
    },
    screenedAt: {
      type: 'string',
      description: 'When screening reached this verdict (ISO 8601).',
    },
  },
}
