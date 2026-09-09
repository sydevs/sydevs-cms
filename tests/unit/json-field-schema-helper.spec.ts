import type { Field, JSONField } from 'payload'

import { json as jsonFieldValidation } from 'payload/shared'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { collections } from '@/collections'
import { jsonFieldSchema, kebabCase } from '@/fields/jsonFieldSchema'
import { globals } from '@/globals'

/**
 * #726: one helper builds every `jsonSchema` in `src/`, deriving `uri`,
 * `fileMatch`, `$id` and `title` from a single title.
 *
 * The cases that matter are the two the helper exists to make impossible: a
 * `$schema` reaching Ajv, and two columns colliding on one derived URI.
 */

/** Payload's built-in validator, with the minimum context it reads. */
const req = { t: (key: string) => key } as never

function runSchema(schema: NonNullable<JSONField['jsonSchema']>, value: unknown): unknown {
  return jsonFieldValidation(value as never, {
    jsonSchema: schema,
    req,
    required: false,
  } as never)
}

describe('kebabCase', () => {
  it('splits PascalCase, and splits an acronym before its trailing word', () => {
    expect(kebabCase('TableOfContentsHeadings')).toBe('table-of-contents-headings')
    expect(kebabCase('Subtitles')).toBe('subtitles')
    expect(kebabCase('APIKey')).toBe('api-key')
    expect(kebabCase('SyncLectureMetadataIds')).toBe('sync-lecture-metadata-ids')
  })
})

describe('jsonFieldSchema', () => {
  it('derives all four fields from the title alone', () => {
    const built = jsonFieldSchema('MeditationFrames', z.array(z.looseObject({})))

    expect(built.uri).toBe('urn:sahajcloud:schema:meditation-frames')
    expect(built.fileMatch).toEqual(['urn:sahajcloud:schema:meditation-frames'])
    expect(built.schema.$id).toBe('urn:sahajcloud:schema:meditation-frames')
    expect(built.schema.title).toBe('MeditationFrames')
  })

  it('refuses a title that derives no slug', () => {
    expect(() => jsonFieldSchema('', z.string())).toThrow(/title is required/)
  })

  it('overrides an $id or title a raw schema brought with it', () => {
    const built = jsonFieldSchema('ClientAbuseScore', {
      $id: 'urn:stale:id',
      title: 'Stale',
      type: 'object',
    })

    expect(built.schema.$id).toBe('urn:sahajcloud:schema:client-abuse-score')
    expect(built.schema.title).toBe('ClientAbuseScore')
  })

  it('keeps a raw JSON Schema verbatim, for what Zod cannot express', () => {
    // `maxProperties` and a bare `enum` with no `type` beside it are the two
    // shapes in this tree that need the escape hatch.
    const built = jsonFieldSchema('UserMessageContext', {
      type: 'object',
      maxProperties: 20,
      properties: { verdict: { enum: ['ok', 'spam'] } },
    })

    expect(built.schema.maxProperties).toBe(20)
    expect(built.schema.properties?.verdict).toEqual({ enum: ['ok', 'spam'] })
  })

  describe('the Zod overload', () => {
    it('emits no $schema, so Ajv can compile the result', () => {
      const built = jsonFieldSchema('ProbeShape', z.strictObject({ a: z.string() }))

      expect(built.schema.$schema).toBeUndefined()
      expect(runSchema(built, { a: 'ok' })).toBe(true)
      expect(runSchema(built, { a: 7 })).not.toBe(true)
    })

    it('fails to validate at all when $schema is left in', () => {
      // The defect the deletion prevents, reintroduced: Ajv 8 resolves
      // `$schema` as a meta-schema reference it does not carry, and throws
      // `no schema with key or ref "…draft-04/schema#"`. That throw happens on
      // every save of a schema-bearing column, so leaving it in breaks writes
      // rather than validation. Anything but a clean `true` here is the bug.
      const built = jsonFieldSchema('ProbeShapeWithSchema', z.strictObject({ a: z.string() }))
      const poisoned = {
        ...built,
        schema: { ...built.schema, $schema: 'http://json-schema.org/draft-04/schema#' },
      }

      let outcome: unknown
      try {
        outcome = runSchema(poisoned, { a: 'ok' })
      } catch (error) {
        outcome = error
      }

      expect(outcome).not.toBe(true)
    })

    it('strips the safe-integer bounds z.int() emits, at any depth', () => {
      const built = jsonFieldSchema('ProbeInts', z.array(z.strictObject({ id: z.int() })))
      const id = (built.schema.items as { properties: { id: Record<string, unknown> } }).properties
        .id

      expect(id).toEqual({ type: 'integer' })
      expect(runSchema(built, [{ id: 3 }])).toBe(true)
      expect(runSchema(built, [{ id: 'three' }])).not.toBe(true)
    })
  })
})

type JsonColumn = { path: string; jsonSchema: NonNullable<JSONField['jsonSchema']> }

/** Walk the containers Payload nests fields in, collecting every JSON column. */
function collectJsonColumns(fields: Field[], path: string, into: JsonColumn[]) {
  for (const field of fields) {
    const name = 'name' in field && field.name ? `${path}.${field.name}` : path
    if (field.type === 'json' && field.jsonSchema) into.push({ path: name, jsonSchema: field.jsonSchema })
    if ('fields' in field && Array.isArray(field.fields))
      collectJsonColumns(field.fields, name, into)
    if (field.type === 'tabs') for (const tab of field.tabs) collectJsonColumns(tab.fields, name, into)
    if (field.type === 'blocks')
      for (const block of field.blocks)
        collectJsonColumns(block.fields, `${name}.${block.slug}`, into)
  }
}

describe('derived URIs across the config', () => {
  const columns: JsonColumn[] = []
  for (const collection of collections) collectJsonColumns(collection.fields, collection.slug, columns)
  for (const global of globals) collectJsonColumns(global.fields, global.slug, columns)

  it('finds the JSON columns, so the assertions below are not vacuous', () => {
    expect(columns.length).toBeGreaterThan(20)
  })

  it('derives every URI from the schema title', () => {
    // What catches a hand-written `jsonSchema` that bypassed the helper: its
    // URI would no longer be a pure function of its title.
    for (const { path, jsonSchema } of columns) {
      const title = jsonSchema.schema.title
      expect(typeof title, `${path} declares no title`).toBe('string')
      expect(jsonSchema.uri, path).toBe(`urn:sahajcloud:schema:${kebabCase(title as string)}`)
      expect(jsonSchema.fileMatch, path).toEqual([jsonSchema.uri])
      expect(jsonSchema.schema.$id, path).toBe(jsonSchema.uri)
    }
  })

  it('never gives one URI two different shapes', () => {
    // Two columns sharing a title merge into one Monaco entry and one generated
    // interface. Sharing a schema on purpose is fine — the four `fileMetadata`
    // columns and the four Meditations join columns each reuse one object — so
    // the collision that matters is one URI carrying two different bodies.
    const shapesByUri = new Map<string, Map<string, string[]>>()
    for (const { path, jsonSchema } of columns) {
      const shapes = shapesByUri.get(jsonSchema.uri) ?? new Map<string, string[]>()
      const body = JSON.stringify(jsonSchema.schema)
      shapes.set(body, [...(shapes.get(body) ?? []), path])
      shapesByUri.set(jsonSchema.uri, shapes)
    }

    for (const [uri, shapes] of shapesByUri) {
      const owners = [...shapes.values()].map((paths) => paths.join(' + '))
      expect(shapes.size, `${uri} carries ${shapes.size} shapes: ${owners.join(' vs ')}`).toBe(1)
    }
  })
})
