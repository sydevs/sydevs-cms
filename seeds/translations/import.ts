/**
 * Translations Seed — all three translation globals
 *
 * Seeds every translation global with English content:
 *   wm-app-translations  → real copy from seeds/wm-app-translations/data.en.json
 *   wm-web-translations  → real copy from seeds/wm-web-translations/data.en.json
 *   sy-atlas-translations → example strings derived from the schema key names
 *
 * Idempotent — re-running overwrites the English locale value for every
 * field. Other locales are untouched.
 *
 * `wm-web-translations` is additionally **published in English** (#707), so
 * `wm-web-config.availableLocales` can offer `en` — that field refuses a
 * locale whose translations are not published. Its `_status` is per-locale
 * (`localizeStatus`, #705), so publishing `en` leaves every other locale a
 * draft. `wm-app-translations` has one status for all locales, so it keeps
 * the plain update: publishing it here would claim 19 translated locales.
 *
 * Usage:
 *   pnpm seed:dev translations --dry-run
 *   pnpm seed:dev translations
 */

import * as path from 'path'

import atlasSchema from '../../src/globals/SahajAtlasTranslations/translationsSchema.json' with { type: 'json' }
import appSchema from '../../src/globals/WeMeditateAppTranslations/translationsSchema.json' with { type: 'json' }
import { pluralStorageKeys } from '../../src/lib/translations/pluralCategories'
import { BaseImporter, type BaseImportOptions } from '../lib'
import {
  buildWmAppGlobalData,
  collectSeedTodos,
  type SeedFile,
  type TranslationsSchemaRoot,
} from '../wm-app-translations/lexicalConverter'

// ============================================================================
// Example-data generator (for wm-web and sy-atlas)
// ============================================================================

type LeafProp = { type: 'string' | 'richText'; plural?: boolean }
type GroupNode = { type: 'object'; properties?: Record<string, LeafProp | GroupNode> }
type SchemaRoot = { type: 'object'; properties?: Record<string, GroupNode> }

function isGroup(n: LeafProp | GroupNode): n is GroupNode {
  return n.type === 'object'
}

function toLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function makeLexical(text: string) {
  return {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children: [
        {
          type: 'paragraph',
          version: 1,
          format: '',
          indent: 0,
          direction: null,
          textFormat: 0,
          children: [
            { type: 'text', version: 1, format: 0, text, detail: 0, mode: 'normal', style: '' },
          ],
        },
      ],
    },
  }
}

function generateExampleData(schema: SchemaRoot): Record<string, unknown> {
  const data: Record<string, unknown> = {}

  function walkNode(node: GroupNode, segments: string[]): void {
    const props = node.properties ?? {}
    const leafSlug = segments.join('_')
    const stringKeys: Record<string, string> = {}

    for (const [key, child] of Object.entries(props)) {
      if (isGroup(child)) {
        walkNode(child, [...segments, key])
      } else if (child.type === 'string') {
        // A `plural: true` key is STORED as its CLDR family, and since #705
        // the column's JSON Schema declares those names and nothing else — so
        // writing the declared key is writing a property the schema rejects.
        // `sy-atlas-translations.emails.sessions_count` is the one such key
        // today, and it made `pnpm seed translations` fail outright.
        for (const storageKey of child.plural === true ? pluralStorageKeys(key) : [key]) {
          stringKeys[storageKey] = toLabel(key)
        }
      } else if (child.type === 'richText') {
        data[`${leafSlug}_${key}`] = makeLexical(toLabel(key))
      }
    }

    if (Object.keys(stringKeys).length > 0) {
      data[leafSlug] = stringKeys
    }
  }

  for (const [tabKey, tabNode] of Object.entries(schema.properties ?? {})) {
    walkNode(tabNode, [tabKey])
  }

  return data
}

// ============================================================================
// Seed definitions
// ============================================================================

const WM_APP_SEED_LOCAL_PATH = 'seeds/wm-app-translations/data.en.json'
const WM_WEB_SEED_LOCAL_PATH = 'seeds/wm-web-translations/data.en.json'

const LOCALE = 'en' as const

/**
 * The wm-web seed file, minus its `_meta` header, IS the `updateGlobal` data:
 * `<tab>.<sub-group>.<key>` for a nested tab, `<tab>.<key>` for a flat one.
 * Nothing transforms it, which is the point — a shape mismatch surfaces as a
 * Payload validation error naming the offending key, not as silently dropped
 * copy. `tests/unit/wm-web-translations-seed.spec.ts` pins it to the schema.
 */
type WmWebSeedFile = { _meta?: unknown } & Record<string, unknown>

// ============================================================================
// Importer
// ============================================================================

export class TranslationsImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'Translations (English seed — all three globals)'
  protected readonly cacheDir = path.resolve(process.cwd(), 'seeds/cache/translations')

  protected async import(): Promise<void> {
    await this.seedWmApp()
    await this.seedWmWeb()
    await this.seedFromSchema('sy-atlas-translations', atlasSchema as SchemaRoot)
  }

  // --------------------------------------------------------------------------
  // wm-app-translations: real English copy from data.en.json
  // --------------------------------------------------------------------------

  private async seedWmApp(): Promise<void> {
    const slug = 'wm-app-translations'

    const { loadJsonData } = await import('../lib/dataLoader')
    const seed = await loadJsonData<SeedFile>({
      localPath: WM_APP_SEED_LOCAL_PATH,
      inlineContent: this.options.inlineData?.[WM_APP_SEED_LOCAL_PATH],
    })

    let data: Record<string, unknown>
    try {
      data = buildWmAppGlobalData(seed, appSchema as TranslationsSchemaRoot)
    } catch (error) {
      this.addError('Transforming seed', error instanceof Error ? error : String(error))
      return
    }

    const todos = collectSeedTodos(seed)
    for (const todo of todos) {
      this.addWarning(todo)
    }

    await this.writeGlobal(slug, data)
  }

  // --------------------------------------------------------------------------
  // wm-web-translations: real English copy from data.en.json
  // --------------------------------------------------------------------------

  private async seedWmWeb(): Promise<void> {
    const { loadJsonData } = await import('../lib/dataLoader')
    const seed = await loadJsonData<WmWebSeedFile>({
      localPath: WM_WEB_SEED_LOCAL_PATH,
      inlineContent: this.options.inlineData?.[WM_WEB_SEED_LOCAL_PATH],
    })

    const { _meta: _ignored, ...data } = seed
    await this.writeGlobal('wm-web-translations', data, { publish: true })
  }

  // --------------------------------------------------------------------------
  // sy-atlas-translations: generated example content
  //
  // Delete `generateExampleData` along with this method when #706 replaces the
  // atlas schema with real copy — it is then the last caller.
  // --------------------------------------------------------------------------

  private async seedFromSchema(slug: string, schema: SchemaRoot): Promise<void> {
    const data = generateExampleData(schema)
    await this.writeGlobal(slug, data)
  }

  // --------------------------------------------------------------------------
  // Shared write helper
  // --------------------------------------------------------------------------

  /**
   * `publish: true` publishes the English locale and nothing else.
   *
   * Under `localizeStatus` (#705) `_status` is itself a localized column, so
   * writing `'published'` at `locale: 'en'` fills only English's cell.
   * `draft: false` keeps Payload out of its save-a-draft branch, and
   * `publishSpecificLocale` names the locale being published in the version
   * snapshot. Every other locale stays a draft, which is what
   * `availableLocales` reads to refuse an untranslated language.
   */
  private async writeGlobal(
    slug: string,
    data: Record<string, unknown>,
    options: { publish?: boolean } = {},
  ): Promise<void> {
    const fieldNames = Object.keys(data)
    const publish = options.publish === true

    if (this.options.dryRun) {
      await this.logger.info(
        `[dry-run] Would write ${fieldNames.length} field(s) to global "${slug}"` +
          (publish ? ` and publish locale "${LOCALE}"` : ''),
      )
      for (const name of fieldNames) {
        this.report.incrementCreated()
        await this.reportDocument(slug, name, 'created', {
          current: fieldNames.indexOf(name) + 1,
          total: fieldNames.length,
        })
      }
      return
    }

    if (!this.payload) {
      throw new Error('Payload instance not initialised (BaseImporter contract violation)')
    }

    try {
      await this.payload.updateGlobal({
        slug: slug as Parameters<typeof this.payload.updateGlobal>[0]['slug'],
        data: (publish
          ? { ...data, _status: 'published' }
          : data) as Parameters<typeof this.payload.updateGlobal>[0]['data'],
        locale: LOCALE,
        ...(publish ? { draft: false as const, publishSpecificLocale: LOCALE } : {}),
      })
      await this.logger.success(
        `${publish ? 'Published' : 'Updated'} global "${slug}" with ${fieldNames.length} field(s) (locale=${LOCALE})`,
      )
      for (const name of fieldNames) {
        this.report.incrementUpdated()
        await this.reportDocument(slug, name, 'updated', {
          current: fieldNames.indexOf(name) + 1,
          total: fieldNames.length,
        })
      }
    } catch (error) {
      this.addError(
        `updateGlobal ${slug} locale=${LOCALE}`,
        error instanceof Error ? error : String(error),
      )
      throw error
    }
  }
}

export default TranslationsImporter
