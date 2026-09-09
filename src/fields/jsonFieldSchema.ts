import type { JSONSchema4 } from 'json-schema'
import type { JSONField } from 'payload'

import { z } from 'zod'

/**
 * Builds the `jsonSchema` a Payload JSON column wants, from **one** title.
 *
 * Payload's `jsonSchema` is `{ uri, fileMatch, schema }`, and every hand-written
 * site repeated the same string three or four times — an exported
 * `*_SCHEMA_URI`, `fileMatch: [URI]`, `$id: URI`, plus a `title` restating it in
 * PascalCase. No URI is referenced for its own sake: Payload needs `uri` only
 * non-empty, and the admin's Monaco editor only needs it unique. So all four
 * derive from the title, and the title is the only thing a caller states.
 *
 * `title` is load-bearing in a way `$id` is not: it names the interface Payload
 * generates into `payload-types.ts`. Renaming a schema's `$id` renames that
 * interface only when `title` is absent, which is why this helper always sets
 * one — the derived URI is then free to change without touching a generated
 * name.
 *
 * Pass a Zod type to declare the shape inline at the field it belongs to. Pass a
 * raw {@link JSONSchema4} for anything Zod cannot express.
 */

/** Namespace every derived `$id` shares. Nothing dereferences it. */
const SCHEMA_URI_PREFIX = 'urn:sahajcloud:schema:'

/**
 * `TableOfContentsHeadings` → `table-of-contents-headings`.
 *
 * The acronym rule runs first so a run of capitals splits before its trailing
 * word (`APIKey` → `api-key`), not inside it.
 */
export function kebabCase(title: string): string {
  return title
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
}

/**
 * `z.int()` emits `minimum: -9007199254740991, maximum: 9007199254740991` — the
 * safe-integer range, which is every integer JSON can carry. Invisible in the
 * generated type and harmless to Ajv, but noise in the schema a reader opens in
 * Monaco. `z.number().int()` emits them too, so stripping here is the only way
 * to be rid of them.
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
 * **`draft-04`, and `$schema` deleted — both are required, for different
 * reasons.**
 *
 * `$schema` must go because Payload compiles this object with Ajv 8, which
 * resolves `$schema` as a meta-schema reference it does not carry, and throws
 * ``no schema with key or ref "http://json-schema.org/draft-04/schema#"``. That
 * throw happens on *every save* of a document holding a schema-bearing column,
 * so leaving it in breaks writes rather than validation.
 *
 * `draft-04` is the draft `JSONSchema4` — the type Payload's `jsonSchema.schema`
 * is declared as — actually names. `draft-07` does not throw, but emits `const`
 * and `propertyNames`, which drift from the style already in the tree and from
 * what the raw-schema overload below produces.
 */
function fromZod(shape: z.ZodType): JSONSchema4 {
  const emitted = z.toJSONSchema(shape, {
    target: 'draft-04',
    reused: 'inline',
    override: stripSafeIntegerBounds,
  }) as Record<string, unknown>

  delete emitted.$schema

  return emitted as JSONSchema4
}

/** Declare a JSON column's shape in Zod, inline at the field. */
export function jsonFieldSchema(
  title: string,
  shape: z.ZodType,
): NonNullable<JSONField['jsonSchema']>
/** Declare it as a raw JSON Schema — the escape hatch, for what Zod cannot say. */
export function jsonFieldSchema(
  title: string,
  shape: JSONSchema4,
): NonNullable<JSONField['jsonSchema']>
export function jsonFieldSchema(
  title: string,
  shape: JSONSchema4 | z.ZodType,
): NonNullable<JSONField['jsonSchema']> {
  const slug = kebabCase(title)
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
