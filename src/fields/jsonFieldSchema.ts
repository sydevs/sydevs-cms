import type { JSONSchema4 } from 'json-schema'
import type { JSONField } from 'payload'

import { toKebabCase } from 'payload/shared'
import { z } from 'zod'

/**
 * Builds the `jsonSchema` a Payload JSON column wants, from **one** title.
 *
 * Payload's `jsonSchema` is `{ uri, fileMatch, schema }`, and every hand-written
 * site repeated the same string three or four times — an exported
 * `*_SCHEMA_URI`, `fileMatch: [URI]`, `$id: URI`, plus a `title` restating it in
 * PascalCase. No URI is referenced for its own sake: Payload's write validator
 * builds a fresh Ajv per call and validates against `schema` directly, and
 * `configToJSONSchema` reads only `schema` too, so `uri` and `fileMatch` reach
 * nothing but the admin's Monaco editor, which needs them merely unique. All
 * four therefore derive from the title, and the title is the only thing a caller
 * states.
 *
 * `title` is the one that is load-bearing: it names the interface Payload
 * generates into `payload-types.ts`. Renaming a schema's `$id` renames that
 * interface only when `title` is absent, which is why this helper always sets
 * one — the derived URI is then free to change without touching a generated
 * name.
 *
 * Pass a Zod type to declare the shape inline at the field it belongs to. Pass a
 * raw {@link JSONSchema4} where the shape is **assembled as data** — properties
 * built by `Object.fromEntries`, or `enum`s spliced from an exported const
 * array — since round-tripping such a shape through Zod only to convert it back
 * buys nothing.
 */

/** Namespace every derived `$id` shares. Nothing dereferences it. */
const SCHEMA_URI_PREFIX = 'urn:sahajcloud:schema:'

/**
 * `z.int()` emits `minimum: -9007199254740991, maximum: 9007199254740991` — the
 * safe-integer range. `z.number().int()` emits them too, so stripping here is
 * the only way to be rid of them.
 *
 * Not cosmetic, despite looking it: Ajv enforces those bounds, so keeping them
 * would make `1e21` invalid on a column that accepts it today. Stripping is what
 * holds an integer column's behaviour still.
 */
function stripSafeIntegerBounds(ctx: { jsonSchema: Record<string, unknown> }): void {
  const schema = ctx.jsonSchema
  if (schema.type !== 'integer') return
  if (schema.minimum === Number.MIN_SAFE_INTEGER) delete schema.minimum
  if (schema.maximum === Number.MAX_SAFE_INTEGER) delete schema.maximum
}

/** Zod 4 marks every schema instance with `_zod`; a plain JSONSchema4 has no such key. */
function isZodType(shape: z.ZodType | JSONSchema4): shape is z.ZodType {
  return typeof shape === 'object' && shape !== null && '_zod' in shape
}

/**
 * Convert a Zod type to the JSON Schema Payload can use.
 *
 * **The target is chosen for Ajv 8, which is what Payload compiles this object
 * with — not for the `JSONSchema4` type the field is declared as, which never
 * reaches a validator.** Ajv 8 implements draft-07 and carries no draft-04
 * meta-schema. The two spell exclusive bounds differently, and only one of them
 * compiles:
 *
 * ```
 * draft-04  z.number().positive() -> { minimum: 0, exclusiveMinimum: true }
 *           Ajv 8: schema is invalid: data/exclusiveMinimum must be number
 * draft-7   z.number().positive() -> { exclusiveMinimum: 0 }          ok
 * ```
 *
 * A draft-04 target therefore hands the next author a column that fails every
 * save the first time they write `.positive()`, `.gt()` or `.lt()` — and the
 * error names a keyword nobody typed. The two draft-07 forms this changes for
 * shapes already in the tree are both no-ops: `const` where draft-04 emitted a
 * one-element `enum`, and `propertyNames: { type: 'string' }` on a record, since
 * every JSON key is a string. `payload-types.ts` regenerates byte-identically
 * either way.
 *
 * `$schema` is deleted for tidiness, not necessity: Ajv 8 resolves the draft-07
 * one fine. It is metadata about the document, and what Payload stores here is a
 * field's shape, so `$id` and `title` are the only metadata that earn their
 * place. (Under a draft-04 target it *was* necessary — Ajv throws `no schema
 * with key or ref` on a meta-schema it does not carry — which is the trap that
 * made draft-04 look survivable.)
 */
function fromZod(shape: z.ZodType): JSONSchema4 {
  const emitted = z.toJSONSchema(shape, {
    target: 'draft-7',
    reused: 'inline',
    override: stripSafeIntegerBounds,
  }) as Record<string, unknown>

  delete emitted.$schema

  return emitted as JSONSchema4
}

/** Declare a JSON column's shape, in Zod or as a raw JSON Schema. */
export function jsonFieldSchema(
  title: string,
  shape: JSONSchema4 | z.ZodType,
): NonNullable<JSONField['jsonSchema']> {
  const slug = toKebabCase(title)
  if (!slug) throw new Error(`jsonFieldSchema: a title is required, got ${JSON.stringify(title)}`)

  const uri = `${SCHEMA_URI_PREFIX}${slug}`
  const schema = isZodType(shape) ? fromZod(shape) : shape

  return {
    uri,
    fileMatch: [uri],
    // `$id` and `title` last: a raw schema carrying either of its own is being
    // migrated, and the derived pair is what the rest of this object agrees with.
    schema: { ...schema, $id: uri, title },
  }
}
