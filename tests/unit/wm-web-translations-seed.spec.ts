/**
 * Pins `seeds/wm-web-translations/data.en.json` to the schema it seeds.
 *
 * The seed file is written by hand and consumed verbatim — the importer
 * strips `_meta` and hands the rest straight to `updateGlobal`. Nothing
 * transforms it, so nothing else would notice a key that drifted out of the
 * schema, a value left blank, or a `%{placeholder}` the translator was never
 * told about. Payload rejects an undeclared key on write, but only for a
 * locale someone actually seeds, and only at run time.
 *
 * It walks the schema with `collectLeafLookups` — the same walker
 * `clientEnglishFallback` uses to decide which keys to fill from English —
 * rather than re-deriving the data path here. A second copy of the nesting
 * rules is a second thing to get wrong.
 *
 * Unit lane: pure JSON in, no Payload bootstrap.
 */

import { describe, expect, it } from 'vitest'

import { PLURAL_CATEGORIES, pluralStorageKeys } from '@/lib/translations/pluralCategories'
import { collectLeafLookups, type SchemaNode } from '@/lib/translations/schemaWalker'

import seedFile from '../../seeds/wm-web-translations/data.en.json' with { type: 'json' }
import schemaJson from '../../src/globals/WeMeditateWebTranslations/translationsSchema.json' with { type: 'json' }

/**
 * English has exactly two plural forms. `few` and `many` exist in the storage
 * family for Russian, Ukrainian and Czech, and `pluralize()` falls back to
 * `other` where a locale does not use them — so seeding them in English would
 * be inventing a form the language has no rule for.
 */
const ENGLISH_PLURAL_CATEGORIES = ['one', 'other'] as const

type LeafProp = { type: 'string' | 'richText'; plural?: boolean; description?: string }

const schema = schemaJson as unknown as {
  properties: Record<string, SchemaNode>
}

const seed = seedFile as unknown as Record<string, unknown>

/** `common.a11y.dismiss`, or `navigation.about_meditation` for a flat tab. */
function seedPath(groupField: string | null, fieldName: string, innerKey: string): string {
  return [groupField, fieldName, innerKey].filter((part) => part !== null).join('.')
}

function readSeed(groupField: string | null, fieldName: string, innerKey: string): unknown {
  const leaf = groupField === null ? seed[fieldName] : (seed[groupField] as never)?.[fieldName]
  if (leaf === null || typeof leaf !== 'object') return undefined
  return (leaf as Record<string, unknown>)[innerKey]
}

interface DeclaredKey {
  groupField: string | null
  fieldName: string
  key: string
  prop: LeafProp
}

/** Every declared string key, with the sub-group it lives in and its schema. */
function declaredKeys(): DeclaredKey[] {
  const out: DeclaredKey[] = []
  for (const [tabSlug, tabNode] of Object.entries(schema.properties)) {
    // `expandPlurals: false` — one entry per DECLARED key, so the plural
    // expectation below is stated once per key rather than once per form.
    for (const lookup of collectLeafLookups(tabSlug, tabNode)) {
      if (lookup.innerKey === null) continue
      // A flat tab's keys hang off the tab node. A nested tab's hang off the
      // sub-group node, which `fieldName` names.
      const source =
        lookup.groupField === null
          ? tabNode
          : ((tabNode.properties ?? {})[lookup.fieldName] as SchemaNode | undefined)
      const prop = (source?.properties ?? {})[lookup.innerKey] as LeafProp | undefined
      if (!prop || prop.type !== 'string') continue
      out.push({
        groupField: lookup.groupField,
        fieldName: lookup.fieldName,
        key: lookup.innerKey,
        prop,
      })
    }
  }
  return out
}

describe('seeds/wm-web-translations/data.en.json', () => {
  const keys = declaredKeys()

  it('declares at least one key (the walker found the schema)', () => {
    // A walker that silently returned nothing would make every assertion
    // below pass over an empty list.
    expect(keys.length).toBeGreaterThan(100)
  })

  describe('covers every key the schema declares', () => {
    it.each(keys.filter((entry) => entry.prop.plural !== true))(
      '$groupField.$fieldName.$key',
      ({ groupField, fieldName, key }) => {
        const value = readSeed(groupField, fieldName, key)
        expect(value, seedPath(groupField, fieldName, key)).toBeTypeOf('string')
      },
    )

    it.each(keys.filter((entry) => entry.prop.plural === true))(
      '$groupField.$fieldName.$key (plural)',
      ({ groupField, fieldName, key }) => {
        for (const category of ENGLISH_PLURAL_CATEGORIES) {
          const storageKey = `${key}_${category}`
          expect(
            readSeed(groupField, fieldName, storageKey),
            seedPath(groupField, fieldName, storageKey),
          ).toBeTypeOf('string')
        }
      },
    )
  })

  it('carries no key the schema does not declare', () => {
    const allowed = new Set<string>()
    for (const { groupField, fieldName, key, prop } of keys) {
      const storageKeys = prop.plural === true ? pluralStorageKeys(key) : [key]
      for (const storageKey of storageKeys) allowed.add(seedPath(groupField, fieldName, storageKey))
    }

    const present: string[] = []
    for (const [topKey, topValue] of Object.entries(seed)) {
      if (topKey === '_meta') continue
      if (topValue === null || typeof topValue !== 'object') continue
      for (const [innerKey, innerValue] of Object.entries(topValue as Record<string, unknown>)) {
        if (innerValue !== null && typeof innerValue === 'object') {
          // Nested tab: <tab>.<sub-group>.<key>
          for (const leafKey of Object.keys(innerValue as Record<string, unknown>)) {
            present.push(`${topKey}.${innerKey}.${leafKey}`)
          }
        } else {
          // Flat tab: <tab>.<key>
          present.push(`${topKey}.${innerKey}`)
        }
      }
    }

    expect(present.filter((path) => !allowed.has(path))).toEqual([])
  })

  it('leaves no value blank', () => {
    const blank: string[] = []
    for (const { groupField, fieldName, key, prop } of keys) {
      const storageKeys =
        prop.plural === true
          ? ENGLISH_PLURAL_CATEGORIES.map((category) => `${key}_${category}`)
          : [key]
      for (const storageKey of storageKeys) {
        const value = readSeed(groupField, fieldName, storageKey)
        if (typeof value === 'string' && value.trim() === '') {
          blank.push(seedPath(groupField, fieldName, storageKey))
        }
      }
    }
    expect(blank).toEqual([])
  })

  // A translator sees only the description. A placeholder the description
  // never mentions reads as literal text, and gets translated as such.
  it('names every placeholder it uses in that key’s description', () => {
    const unexplained: string[] = []
    for (const { groupField, fieldName, key, prop } of keys) {
      const description = prop.description ?? ''
      const storageKeys =
        prop.plural === true
          ? ENGLISH_PLURAL_CATEGORIES.map((category) => `${key}_${category}`)
          : [key]
      for (const storageKey of storageKeys) {
        const value = readSeed(groupField, fieldName, storageKey)
        if (typeof value !== 'string') continue
        for (const match of value.matchAll(/%\{(\w+)\}/g)) {
          if (!description.includes(`%{${match[1]}}`)) {
            unexplained.push(`${seedPath(groupField, fieldName, storageKey)} → %{${match[1]}}`)
          }
        }
      }
    }
    expect(unexplained).toEqual([])
  })

  // `strict` turns a limit into a save gate, measured on the RAW string —
  // `%{count}` included. Seeding a value the gate then refuses would make
  // `pnpm seed translations` fail on a fresh database.
  it('keeps every strict value inside its own limit', () => {
    const over: string[] = []
    for (const { groupField, fieldName, key, prop } of keys) {
      const limit = (prop as { maxLength?: number; strict?: boolean }).maxLength
      if (!(prop as { strict?: boolean }).strict || typeof limit !== 'number') continue
      const storageKeys =
        prop.plural === true
          ? ENGLISH_PLURAL_CATEGORIES.map((category) => `${key}_${category}`)
          : [key]
      for (const storageKey of storageKeys) {
        const value = readSeed(groupField, fieldName, storageKey)
        if (typeof value === 'string' && [...value].length > limit) {
          over.push(`${seedPath(groupField, fieldName, storageKey)} (${[...value].length}/${limit})`)
        }
      }
    }
    expect(over).toEqual([])
  })

  it('agrees with the storage family the field builder expands to', () => {
    // Guards the assumption the English-only cases above rest on: `one` and
    // `other` really are members of the family, so seeding them populates
    // real columns rather than keys nothing reads.
    for (const category of ENGLISH_PLURAL_CATEGORIES) {
      expect(PLURAL_CATEGORIES).toContain(category)
    }
    expect(pluralStorageKeys('classes_shown')).toContain('classes_shown_one')
    expect(pluralStorageKeys('classes_shown')).toContain('classes_shown_other')
  })
})
