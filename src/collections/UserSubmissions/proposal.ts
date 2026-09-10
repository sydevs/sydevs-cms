import type { JSONSchema4 } from 'json-schema'

/**
 * The `proposed` column: a nested Events field patch, exactly as submitted.
 *
 * **Deliberately open**, and that is the interesting decision. Every other JSON
 * column here closes its shape, because a single internal writer owns it. This
 * one is written by the public, and the keys it may carry are *derived from the
 * live Events config* — `proposableEventFields` walks `flattenedFields` and
 * refuses anything privileged or system-written. Enumerating those keys here
 * would give the rule two definitions, and the copy in this file would go stale
 * the first time somebody added a field to Events.
 *
 * So the schema carries what a schema can carry — it is an object, not an array
 * or a scalar, and it is bounded — and the key gate stays in
 * `validateProposal`. That split is forced as well as chosen: supplying a
 * custom `validate` **replaces** the built-in validator that runs the schema
 * (`src/collections/AGENTS.md`), so the two cannot both live on the field. A
 * `beforeValidate` hook composes with the schema instead of displacing it.
 *
 * Declaring it still buys the half a hook cannot: `generate:types` reads the
 * schema, so consumers get an object type rather than
 * `{ [k: string]: unknown } | unknown[] | string | number | boolean | null`,
 * and a caller posting `"proposed": "hello"` is refused at the collection
 * rather than three files away.
 */
export const proposedJsonSchema: JSONSchema4 = {
  $id: 'urn:sahajcloud:schema:submission-proposed',
  title: 'SubmissionProposal',
  type: 'object',
  // Bounds a public blob without naming its keys. A real proposal touches a
  // handful of Events fields; nothing legitimate approaches this.
  maxProperties: 60,
  // `true`, not a value schema: a proposal nests (an address group, a
  // schedule), so no single value type describes it. `true` generates
  // `[k: string]: unknown`, which is what a consumer must narrow anyway.
  additionalProperties: true,
}
