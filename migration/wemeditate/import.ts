#!/usr/bin/env tsx

import 'dotenv/config'
import { CollectionSlug, getPayload, Payload } from 'payload'
import configPromise from '../../src/payload.config'
import { execSync } from 'child_process'
import { Client } from 'pg'
import { promises as fs } from 'fs'
import * as path from 'path'
import { Logger, FileUtils, TagManager, PayloadHelpers } from '../lib'
import { MediaDownloader, extractMediaUrls, extractAuthorImageUrl } from '../lib/mediaDownloader'
import {
  convertEditorJSToLexical,
  type ConversionContext,
  type EditorJSContent,
} from '../lib/lexicalConverter'

// ============================================================================
// CONFIGURATION
// ============================================================================

const IMPORT_TAG = 'import-wemeditate'
const CACHE_DIR = path.resolve(process.cwd(), 'migration/cache/wemeditate')
const STATE_FILE = path.join(CACHE_DIR, 'import-state.json')
const ID_MAPS_FILE = path.join(CACHE_DIR, 'id-mappings.json')
const LOG_FILE = path.join(CACHE_DIR, 'import.log')
const DATA_BIN = path.resolve(process.cwd(), 'migration/wemeditate/data.bin')

const STORAGE_BASE_URL = 'https://assets.wemeditate.com/uploads/'

const ARTICLE_TYPE_TAGS: Record<number, string> = {
  0: 'article',
  1: 'artwork',
  2: 'event',
  3: 'report',
}

const CONTENT_TYPE_TAGS: Record<string, string> = {
  static_pages: 'static-page',
  articles: 'article',
  promo_pages: 'promo',
  subtle_system_nodes: 'subtle-system',
  treatments: 'treatment',
}

const LOCALES = ['en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk']
const DB_NAME = 'temp_wemeditate_import'

// ============================================================================
// TYPES
// ============================================================================

interface ImportState {
  lastUpdated: string
  phase: string
  itemsCreated: Record<string, string>
  failed: string[]
}

interface ScriptOptions {
  dryRun: boolean
  reset: boolean
  resume: boolean
  clearCache?: boolean
}

interface IdMaps {
  authors: Map<number, string>
  categories: Map<number, string>
  staticPages: Map<number, string>
  articles: Map<number, string>
  promoPages: Map<number, string>
  subtleSystemNodes: Map<number, string>
  treatments: Map<number, string>
  media: Map<string, string>
  forms: Map<string, string>
  externalVideos: Map<string, string>
}

// ============================================================================
// MAIN IMPORTER CLASS
// ============================================================================

class WeMeditateImporter {
  private payload!: Payload
  private logger!: Logger
  private fileUtils!: FileUtils
  private tagManager!: TagManager
  private payloadHelpers!: PayloadHelpers
  private mediaDownloader!: MediaDownloader

  private dbClient!: Client
  private state: ImportState
  private options: ScriptOptions
  private idMaps: IdMaps = {
    authors: new Map(),
    categories: new Map(),
    staticPages: new Map(),
    articles: new Map(),
    promoPages: new Map(),
    subtleSystemNodes: new Map(),
    treatments: new Map(),
    media: new Map(),
    forms: new Map(),
    externalVideos: new Map(),
  }
  private meditationTitleMap: Map<string, string> = new Map()

  constructor(options: ScriptOptions) {
    this.options = options
    this.state = {
      lastUpdated: new Date().toISOString(),
      phase: 'initializing',
      itemsCreated: {},
      failed: [],
    }
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  async saveState() {
    this.state.lastUpdated = new Date().toISOString()
    await fs.writeFile(STATE_FILE, JSON.stringify(this.state, null, 2))
  }

  async loadState() {
    try {
      const data = await fs.readFile(STATE_FILE, 'utf-8')
      this.state = JSON.parse(data)
      await this.logger.log(`Loaded state from ${STATE_FILE}`)
    } catch {
      await this.logger.log('No previous state found, starting fresh')
    }
  }

  async saveIdMappings() {
    const cache: Record<string, Record<string, string>> = {}
    for (const [key, map] of Object.entries(this.idMaps)) {
      cache[key] = Object.fromEntries(map)
    }
    await fs.writeFile(ID_MAPS_FILE, JSON.stringify(cache, null, 2))
  }

  async loadIdMappings() {
    try {
      const data = await fs.readFile(ID_MAPS_FILE, 'utf-8')
      const cached = JSON.parse(data)
      for (const [key, value] of Object.entries(cached)) {
        const entries = Object.entries(value as Record<string, string>)
        // Convert string keys to numbers for numeric ID maps
        if (key === 'media' || key === 'forms' || key === 'externalVideos') {
          this.idMaps[key as keyof IdMaps] = new Map(entries) as any
        } else {
          this.idMaps[key as keyof IdMaps] = new Map(entries.map(([k, v]) => [Number(k), v])) as any
        }
      }
      await this.logger.log('Loaded ID mappings from cache')
    } catch {
      await this.logger.log('No existing ID mappings found, starting fresh')
    }
  }

  // ============================================================================
  // DATABASE MANAGEMENT
  // ============================================================================

  async setupDatabase() {
    await this.logger.log('\n=== Setting up PostgreSQL Database ===')

    // Drop existing database if it exists
    try {
      execSync(`dropdb ${DB_NAME} 2>/dev/null || true`, { stdio: 'ignore' })
    } catch {
      // Ignore errors
    }

    // Create new database
    execSync(`createdb ${DB_NAME}`)
    await this.logger.log(`✓ Created database: ${DB_NAME}`)

    // Restore from backup
    execSync(`pg_restore -d ${DB_NAME} --no-owner ${DATA_BIN} 2>/dev/null || true`, {
      stdio: 'ignore',
    })
    await this.logger.log(`✓ Restored data from: ${DATA_BIN}`)

    // Connect to database
    this.dbClient = new Client({
      database: DB_NAME,
    })
    await this.dbClient.connect()
    await this.logger.log(`✓ Connected to database`)
  }

  async cleanupDatabase() {
    if (this.dbClient) {
      await this.dbClient.end()
      await this.logger.log('✓ Disconnected from database')
    }

    try {
      execSync(`dropdb ${DB_NAME} 2>/dev/null || true`, { stdio: 'ignore' })
      await this.logger.log(`✓ Dropped database: ${DB_NAME}`)
    } catch {
      // Ignore errors
    }
  }

  // ============================================================================
  // RESET FUNCTIONALITY
  // ============================================================================

  async resetCollections() {
    await this.logger.log('\n=== Resetting Collections ===')

    const collections = [
      'authors',
      'pages',
      'page-tags',
      'media',
      'forms',
      'form-submissions',
      'external-videos',
    ]

    for (const collection of collections) {
      await this.logger.log(`Deleting documents with tag ${IMPORT_TAG} from ${collection}...`)

      try {
        const result = await this.payload.find({
          collection: collection as CollectionSlug,
          where: {
            tags: { contains: IMPORT_TAG },
          },
          limit: 1000,
        })

        for (const doc of result.docs) {
          await this.payload.delete({
            collection: collection as CollectionSlug,
            id: doc.id,
          })
        }

        await this.logger.log(`✓ Deleted ${result.docs.length} documents from ${collection}`)
      } catch (error) {
        await this.logger.log(`Note: ${collection} might not support tags or doesn't exist`, false)
      }
    }

    // Reset state
    this.state = {
      lastUpdated: new Date().toISOString(),
      phase: 'initializing',
      itemsCreated: {},
      failed: [],
    }
    await this.saveState()
    await this.logger.log('✓ Reset complete')
  }

  // ============================================================================
  // IMPORT METHODS
  // ============================================================================

  async importAuthors() {
    await this.logger.log('\n=== Importing Authors ===')
    this.state.phase = 'importing-authors'
    await this.saveState()

    // Get authors with their translations
    const authorsResult = await this.dbClient.query(`
      SELECT
        a.id,
        a.country_code,
        a.years_meditating,
        json_agg(
          json_build_object(
            'locale', at.locale,
            'name', at.name,
            'title', at.title,
            'description', at.description
          )
        ) as translations
      FROM authors a
      LEFT JOIN author_translations at ON a.id = at.author_id
      GROUP BY a.id, a.country_code, a.years_meditating
    `)

    await this.logger.log(`Found ${authorsResult.rows.length} authors to import`)

    for (const author of authorsResult.rows) {
      const itemKey = `author-${author.id}`

      if (this.state.itemsCreated[itemKey]) {
        await this.logger.log(`Skipping author ${author.id}, already created`)
        continue
      }

      try {
        // Build localized data
        const localizedData: any = {}
        for (const translation of author.translations) {
          if (translation.locale && translation.name) {
            localizedData[translation.locale] = {
              name: translation.name,
              title: translation.title || '',
              description: translation.description || '',
            }
          }
        }

        if (Object.keys(localizedData).length === 0) {
          await this.logger.log(`Skipping author ${author.id}: no valid translations`, true)
          continue
        }

        // Create author document with first locale
        const locales = Object.keys(localizedData)
        const firstLocale = locales[0] as any

        const authorDoc = await this.payload.create({
          collection: 'authors',
          data: {
            name: localizedData[firstLocale].name,
            title: localizedData[firstLocale].title,
            description: localizedData[firstLocale].description,
            countryCode: author.country_code || undefined,
            yearsMeditating: author.years_meditating || undefined,
          },
          locale: firstLocale,
        })

        // Update with other locales
        for (let i = 1; i < locales.length; i++) {
          const locale = locales[i] as any
          await this.payload.update({
            collection: 'authors',
            id: authorDoc.id,
            data: {
              name: localizedData[locale].name,
              title: localizedData[locale].title,
              description: localizedData[locale].description,
            },
            locale,
          })
        }

        this.idMaps.authors.set(author.id, authorDoc.id as string)
        this.state.itemsCreated[itemKey] = authorDoc.id as string
        await this.logger.log(`✓ Created author: ${author.id} -> ${authorDoc.id} (${locales.length} locales)`)
      } catch (error: any) {
        await this.logger.log(`Error importing author ${author.id}: ${error.message}`, true)
      }
    }

    await this.saveState()
    await this.saveIdMappings()
  }

  async importCategories() {
    await this.logger.log('\n=== Importing Categories as Page Tags ===')
    this.state.phase = 'importing-categories'
    await this.saveState()

    const categoriesResult = await this.dbClient.query(`
      SELECT
        c.id,
        json_agg(
          json_build_object(
            'locale', ct.locale,
            'name', ct.name,
            'slug', ct.slug
          )
        ) as translations
      FROM categories c
      LEFT JOIN category_translations ct ON c.id = ct.category_id
      GROUP BY c.id
    `)

    await this.logger.log(`Found ${categoriesResult.rows.length} categories to import`)

    for (const category of categoriesResult.rows) {
      const itemKey = `category-${category.id}`

      if (this.state.itemsCreated[itemKey]) {
        await this.logger.log(`Skipping category ${category.id}, already created`)
        continue
      }

      try {
        // Build localized data
        const localizedData: any = {}
        for (const translation of category.translations) {
          if (translation.locale && translation.name) {
            localizedData[translation.locale] = {
              title: translation.name,
              name: translation.slug || translation.name.toLowerCase(),
            }
          }
        }

        if (Object.keys(localizedData).length === 0) {
          await this.logger.log(`Skipping category ${category.id}: no valid translations`, true)
          continue
        }

        const locales = Object.keys(localizedData)
        const firstLocale = locales[0] as any

        // Create page tag with first locale
        const tagDoc = await this.payload.create({
          collection: 'page-tags',
          data: {
            name: localizedData[firstLocale].name,
            title: localizedData[firstLocale].title,
          },
          locale: firstLocale,
        })

        // Update with other locales
        for (let i = 1; i < locales.length; i++) {
          const locale = locales[i] as any
          await this.payload.update({
            collection: 'page-tags',
            id: tagDoc.id,
            data: {
              title: localizedData[locale].title,
            },
            locale,
          })
        }

        this.idMaps.categories.set(category.id, tagDoc.id as string)
        this.state.itemsCreated[itemKey] = tagDoc.id as string
        await this.logger.log(`✓ Created category tag: ${category.id} -> ${tagDoc.id} (${locales.length} locales)`)
      } catch (error: any) {
        await this.logger.log(`Error importing category ${category.id}: ${error.message}`, true)
      }
    }

    await this.saveState()
    await this.saveIdMappings()
  }

  async importContentTypeTags() {
    await this.logger.log('\n=== Creating Content Type Tags ===')

    for (const [sourceType, tagName] of Object.entries(CONTENT_TYPE_TAGS)) {
      const itemKey = `content-type-tag-${tagName}`

      if (this.state.itemsCreated[itemKey]) {
        continue
      }

      try {
        const tagDoc = await this.payload.create({
          collection: 'page-tags',
          data: {
            name: tagName,
            title: tagName,
          },
        })

        this.state.itemsCreated[itemKey] = tagDoc.id as string
        await this.logger.log(`✓ Created content type tag: ${tagName}`)
      } catch (error: any) {
        // Tag might already exist
        const existing = await this.payload.find({
          collection: 'page-tags',
          where: { name: { equals: tagName } },
        })
        if (existing.docs.length > 0) {
          this.state.itemsCreated[itemKey] = existing.docs[0].id as string
        }
      }
    }

    await this.saveState()
  }

  async importPages(tableName: string, translationsTable: string) {
    await this.logger.log(`\n=== Importing ${tableName} ===`)
    this.state.phase = `importing-${tableName}`
    await this.saveState()

    // Build SQL query based on table type - only articles has these extra fields
    const isArticles = tableName === 'articles'
    const selectFields = ['p.id']
    const groupByFields = ['p.id']

    if (isArticles) {
      selectFields.push('p.author_id', 'p.article_type', 'p.category_id')
      groupByFields.push('p.author_id', 'p.article_type', 'p.category_id')
    }

    const pagesResult = await this.dbClient.query(`
      SELECT
        ${selectFields.join(',\n        ')},
        json_agg(
          json_build_object(
            'locale', pt.locale,
            'name', pt.name,
            'slug', pt.slug,
            'content', pt.content,
            'published_at', pt.published_at,
            'state', pt.state
          ) ORDER BY pt.locale
        ) as translations
      FROM ${tableName} p
      LEFT JOIN ${translationsTable} pt ON p.id = pt.${tableName.slice(0, -1)}_id
      GROUP BY ${groupByFields.join(', ')}
    `)

    await this.logger.log(`Found ${pagesResult.rows.length} pages to import from ${tableName}`)

    for (const page of pagesResult.rows) {
      const itemKey = `${tableName}-${page.id}`

      if (this.state.itemsCreated[itemKey]) {
        await this.logger.log(`Skipping ${tableName} ${page.id}, already created`)
        continue
      }

      try {
        // Build localized data
        const localizedData: any = {}
        for (const translation of page.translations) {
          if (translation.locale && translation.name && translation.state === 1) {
            localizedData[translation.locale] = {
              title: translation.name,
              slug: translation.slug,
              content: translation.content,
              publishAt: translation.published_at,
            }
          }
        }

        if (Object.keys(localizedData).length === 0) {
          await this.logger.log(`Skipping ${tableName} ${page.id}: no published translations`, false)
          continue
        }

        const firstLocale = Object.keys(localizedData)[0]

        // Get author relationship
        let authorId: string | undefined
        if (page.author_id && this.idMaps.authors.has(page.author_id)) {
          authorId = this.idMaps.authors.get(page.author_id)
        }

        // Get tags
        const tags: string[] = []

        // Add content type tag
        const contentTypeTag = CONTENT_TYPE_TAGS[tableName]
        if (contentTypeTag && this.state.itemsCreated[`content-type-tag-${contentTypeTag}`]) {
          tags.push(this.state.itemsCreated[`content-type-tag-${contentTypeTag}`])
        }

        // Add article type tag
        if (page.article_type !== undefined && ARTICLE_TYPE_TAGS[page.article_type]) {
          const articleTypeTag = ARTICLE_TYPE_TAGS[page.article_type]
          const articleTypeTagKey = `content-type-tag-${articleTypeTag}`
          if (this.state.itemsCreated[articleTypeTagKey]) {
            tags.push(this.state.itemsCreated[articleTypeTagKey])
          }
        }

        // Add category tag
        if (page.category_id && this.idMaps.categories.has(page.category_id)) {
          tags.push(this.idMaps.categories.get(page.category_id)!)
        }

        // For now, create with minimal content (we'll add full EditorJS conversion in next phase)
        const pageDoc = await this.payload.create({
          collection: 'pages',
          data: {
            title: localizedData[firstLocale].title,
            slug: localizedData[firstLocale].slug,
            publishAt: localizedData[firstLocale].publishAt || undefined,
            author: authorId,
            tags: tags.length > 0 ? tags : undefined,
          },
        })

        // Store in appropriate id map
        const mapKey = tableName.replace(/_/g, '').replace(/s$/, '') + 's'
        if (mapKey in this.idMaps) {
          (this.idMaps as any)[mapKey].set(page.id, pageDoc.id)
        }

        this.state.itemsCreated[itemKey] = pageDoc.id as string
        await this.logger.log(`✓ Created page from ${tableName}: ${page.id} -> ${pageDoc.id}`)
      } catch (error: any) {
        await this.logger.log(`Error importing ${tableName} ${page.id}: ${error.message}`, true)
      }
    }

    await this.saveState()
    await this.saveIdMappings()
  }

  async importPromoPages() {
    await this.logger.log('\n=== Importing promo_pages ===')
    this.state.phase = 'importing-promo_pages'
    await this.saveState()

    // promo_pages has a different structure - no translations table, locale on main table
    const pagesResult = await this.dbClient.query(`
      SELECT
        id,
        name,
        slug,
        content,
        published_at,
        state,
        locale
      FROM promo_pages
      WHERE state = 1
      ORDER BY id
    `)

    await this.logger.log(`Found ${pagesResult.rows.length} published promo_pages to import`)

    for (const page of pagesResult.rows) {
      const itemKey = `promo_pages-${page.id}`

      if (this.state.itemsCreated[itemKey]) {
        await this.logger.log(`Skipping promo_pages ${page.id}, already created`)
        continue
      }

      try {
        // Get tags
        const tags: string[] = []

        // Add content type tag
        const contentTypeTag = CONTENT_TYPE_TAGS['promo_pages']
        if (contentTypeTag && this.state.itemsCreated[`content-type-tag-${contentTypeTag}`]) {
          tags.push(this.state.itemsCreated[`content-type-tag-${contentTypeTag}`])
        }

        // Create page document
        const pageDoc = await this.payload.create({
          collection: 'pages',
          data: {
            title: page.name,
            slug: page.slug,
            publishAt: page.published_at || undefined,
            tags,
          },
          locale: page.locale as any,
        })

        // Store mapping
        const mapKey = `promoPages`
        if (!this.idMaps[mapKey as keyof typeof this.idMaps]) {
          ;(this.idMaps as any)[mapKey] = new Map()
        }
        ;(this.idMaps as unknown as Record<string, Map<number, string>>)[mapKey].set(
          page.id,
          pageDoc.id as string
        )

        this.state.itemsCreated[itemKey] = pageDoc.id as string
        await this.logger.log(`✓ Created page from promo_pages: ${page.id} -> ${pageDoc.id}`)
      } catch (error: any) {
        await this.logger.log(`Error importing promo_pages ${page.id}: ${error.message}`, true)
      }
    }

    await this.saveState()
    await this.saveIdMappings()
  }

  async importPromoPagesWithContent() {
    await this.logger.log('\n=== Updating promo_pages with Content ===')
    this.state.phase = 'updating-promo_pages-content'
    await this.saveState()

    // promo_pages has content directly on the table
    const pagesResult = await this.dbClient.query(`
      SELECT
        id,
        locale,
        content
      FROM promo_pages
      WHERE state = 1 AND content IS NOT NULL
      ORDER BY id
    `)

    await this.logger.log(`Updating ${pagesResult.rows.length} promo_pages with content`)

    for (const page of pagesResult.rows) {
      const pageId = this.idMaps.promoPages.get(page.id)
      if (!pageId) {
        await this.logger.log(`Warning: Promo page ${page.id} not found in ID map`, true)
        continue
      }

      try {
        const locale = page.locale
        const content = page.content as EditorJSContent

        // Build conversion context
        const context: ConversionContext = {
          payload: this.payload,
          logger: this.logger,
          pageId: page.id,
          locale,
          mediaMap: this.idMaps.media,
          formMap: this.idMaps.forms,
          externalVideoMap: this.idMaps.externalVideos,
          treatmentMap: this.idMaps.treatments,
          meditationTitleMap: this.meditationTitleMap,
        }

        // Convert EditorJS to Lexical
        const lexicalContent = await convertEditorJSToLexical(content, context)

        // Update page with content
        await this.payload.update({
          collection: 'pages',
          id: pageId,
          data: {
            content: lexicalContent as any,
          },
          locale: locale as any,
        })

        await this.logger.log(`✓ Updated promo_page ${page.id} -> ${pageId} with content`)
      } catch (error: any) {
        await this.logger.log(
          `Error updating promo_page ${page.id} with content: ${error.message}`,
          true
        )
        throw error // Fail on content conversion error
      }
    }

    await this.saveState()
  }

  async importForms() {
    await this.logger.log('\n=== Creating Shared Forms ===')
    this.state.phase = 'creating-forms'
    await this.saveState()

    const formConfigs = {
      contact: {
        title: 'Contact Form',
        fields: [
          {
            name: 'name',
            label: 'Name',
            blockType: 'text' as const,
            required: true,
          },
          {
            name: 'email',
            label: 'Email',
            blockType: 'email' as const,
            required: true,
          },
          {
            name: 'message',
            label: 'Message',
            blockType: 'textarea' as const,
            required: true,
          },
        ],
      },
      signup: {
        title: 'Signup Form',
        fields: [
          {
            name: 'email',
            label: 'Email',
            blockType: 'email' as const,
            required: true,
          },
        ],
      },
    }

    for (const [formType, config] of Object.entries(formConfigs)) {
      const itemKey = `form-${formType}`

      if (this.state.itemsCreated[itemKey]) {
        this.idMaps.forms.set(formType, this.state.itemsCreated[itemKey])
        await this.logger.log(`Skipping form ${formType}, already created`)
        continue
      }

      try {
        // Check if form already exists
        const existing = await this.payload.find({
          collection: 'forms',
          where: {
            title: { equals: config.title },
          },
        })

        if (existing.docs.length > 0) {
          this.idMaps.forms.set(formType, existing.docs[0].id as string)
          this.state.itemsCreated[itemKey] = existing.docs[0].id as string
          await this.logger.log(`✓ Reusing existing form: ${config.title}`)
          continue
        }

        // Create new form
        const form = await this.payload.create({
          collection: 'forms',
          data: {
            title: config.title,
            fields: config.fields,
            submitButtonLabel: 'Submit',
            confirmationType: 'message' as const,
            confirmationMessage: {
              root: {
                type: 'root',
                version: 1,
                children: [
                  {
                    type: 'paragraph',
                    version: 1,
                    children: [
                      {
                        type: 'text',
                        version: 1,
                        text: 'Thank you for your submission!',
                        format: 0,
                        style: '',
                        mode: 'normal',
                        detail: 0,
                      },
                    ],
                    direction: null,
                    format: '',
                    indent: 0,
                    textFormat: 0,
                  },
                ],
                direction: null,
                format: '',
                indent: 0,
              },
            },
          },
        })

        this.idMaps.forms.set(formType, form.id as string)
        this.state.itemsCreated[itemKey] = form.id as string
        await this.logger.log(`✓ Created form: ${config.title}`)
      } catch (error: any) {
        await this.logger.log(`Error creating form ${formType}: ${error.message}`, true)
      }
    }

    await this.saveState()
    await this.saveIdMappings()
  }

  async buildMeditationTitleMap() {
    await this.logger.log('\n=== Building Meditation Title Map ===')

    try {
      const meditations = await this.payload.find({
        collection: 'meditations',
        limit: 1000,
      })

      for (const meditation of meditations.docs) {
        if (meditation.title) {
          const title = meditation.title.toLowerCase().trim()
          this.meditationTitleMap.set(title, meditation.id as string)
        }
      }

      await this.logger.log(`✓ Built map with ${this.meditationTitleMap.size} meditations`)
    } catch (error: any) {
      await this.logger.log(`Error building meditation map: ${error.message}`, true)
    }
  }

  async importExternalVideos() {
    await this.logger.log('\n=== Scanning for External Videos ===')
    this.state.phase = 'importing-external-videos'
    await this.saveState()

    // Collect all vimeo/youtube IDs from content
    const videoIds = new Set<string>()
    const videoMetadata = new Map<
      string,
      { title: string; thumbnail: string; vimeoId?: string; youtubeId?: string }
    >()

    for (const [_tableName, translationsTable] of [
      ['static_pages', 'static_page_translations'],
      ['articles', 'article_translations'],
      ['subtle_system_nodes', 'subtle_system_node_translations'],
      ['treatments', 'treatment_translations'],
    ]) {
      const result = await this.dbClient.query(`
        SELECT content
        FROM ${translationsTable}
        WHERE content IS NOT NULL AND state = 1
      `)

      for (const row of result.rows) {
        if (!row.content || !row.content.blocks) continue

        for (const block of row.content.blocks) {
          if (block.type === 'vimeo' && block.data) {
            const videoId = block.data.vimeo_id || block.data.youtube_id
            if (videoId) {
              videoIds.add(videoId)
              videoMetadata.set(videoId, {
                title: block.data.title || '',
                thumbnail: block.data.thumbnail || '',
                vimeoId: block.data.vimeo_id,
                youtubeId: block.data.youtube_id,
              })
            }
          }
        }
      }
    }

    // Scan promo_pages (different structure)
    const promoResult = await this.dbClient.query(`
      SELECT content
      FROM promo_pages
      WHERE content IS NOT NULL AND state = 1
    `)

    for (const row of promoResult.rows) {
      if (!row.content || !row.content.blocks) continue

      for (const block of row.content.blocks) {
        if (block.type === 'vimeo' && block.data) {
          const videoId = block.data.vimeo_id || block.data.youtube_id
          if (videoId) {
            videoIds.add(videoId)
            videoMetadata.set(videoId, {
              title: block.data.title || '',
              thumbnail: block.data.preview || '',
              vimeoId: block.data.vimeo_id,
              youtubeId: block.data.youtube_id,
            })
          }
        }
      }
    }

    await this.logger.log(`Found ${videoIds.size} unique external videos`)

    // Create ExternalVideo documents
    for (const videoId of videoIds) {
      const itemKey = `external-video-${videoId}`

      if (this.state.itemsCreated[itemKey]) {
        this.idMaps.externalVideos.set(videoId, this.state.itemsCreated[itemKey])
        continue
      }

      try {
        const metadata = videoMetadata.get(videoId)!

        // Build video URL
        const videoUrl = metadata.vimeoId
          ? `https://vimeo.com/${metadata.vimeoId}`
          : `https://youtube.com/watch?v=${metadata.youtubeId}`

        // Thumbnail is required - skip if we don't have one or can't create it
        if (!metadata.thumbnail) {
          await this.logger.log(
            `Warning: Skipping ExternalVideo ${videoId} - no thumbnail available`,
            true
          )
          continue
        }

        // Try to get thumbnail from media map
        const thumbnailUrl = metadata.thumbnail.startsWith('http')
          ? metadata.thumbnail
          : STORAGE_BASE_URL + metadata.thumbnail
        const thumbnailId = this.idMaps.media.get(thumbnailUrl)

        if (!thumbnailId) {
          await this.logger.log(
            `Warning: Skipping ExternalVideo ${videoId} - thumbnail not in media map`,
            true
          )
          continue
        }

        const externalVideo = await this.payload.create({
          collection: 'external-videos',
          data: {
            title: metadata.title || `Video ${videoId}`,
            videoUrl,
            thumbnail: thumbnailId,
          },
        })

        this.idMaps.externalVideos.set(videoId, externalVideo.id as string)
        this.state.itemsCreated[itemKey] = externalVideo.id as string
        await this.logger.log(`✓ Created ExternalVideo: ${videoId}`)
      } catch (error: any) {
        await this.logger.log(`Error creating ExternalVideo ${videoId}: ${error.message}`, true)
      }
    }

    await this.saveState()
    await this.saveIdMappings()
  }

  async importMedia() {
    await this.logger.log('\n=== Importing Media Files ===')
    this.state.phase = 'importing-media'
    await this.saveState()

    // Initialize media downloader
    this.mediaDownloader = new MediaDownloader(CACHE_DIR, this.logger)
    await this.mediaDownloader.initialize()

    // Collect all media URLs from content
    const mediaUrls = new Set<string>()
    const mediaMetadata = new Map<string, { alt: string; credit: string; caption: string }>()

    // Scan all page content with translations
    for (const [_tableName, translationsTable] of [
      ['static_pages', 'static_page_translations'],
      ['articles', 'article_translations'],
      ['subtle_system_nodes', 'subtle_system_node_translations'],
      ['treatments', 'treatment_translations'],
    ]) {
      const result = await this.dbClient.query(`
        SELECT content, locale
        FROM ${translationsTable}
        WHERE content IS NOT NULL AND state = 1
      `)

      for (const row of result.rows) {
        if (!row.content) continue

        const urls = extractMediaUrls(row.content, STORAGE_BASE_URL)
        urls.forEach((url) => mediaUrls.add(url))

        // Extract metadata from blocks
        if (row.content.blocks) {
          for (const block of row.content.blocks) {
            if (block.type === 'media' && block.data.items) {
              for (const item of block.data.items) {
                if (item.image?.preview) {
                  const url = item.image.preview
                  mediaMetadata.set(url, {
                    alt: item.alt || '',
                    credit: item.credit || '',
                    caption: item.caption || '',
                  })
                }
              }
            }
          }
        }
      }
    }

    // Scan promo_pages (different structure - no translations table)
    const promoResult = await this.dbClient.query(`
      SELECT content, locale
      FROM promo_pages
      WHERE content IS NOT NULL AND state = 1
    `)

    for (const row of promoResult.rows) {
      if (!row.content) continue

      const urls = extractMediaUrls(row.content, STORAGE_BASE_URL)
      urls.forEach((url) => mediaUrls.add(url))

      // Extract metadata from blocks
      if (row.content.blocks) {
        for (const block of row.content.blocks) {
          if (block.type === 'media' && block.data.items) {
            for (const item of block.data.items) {
              if (item.image?.preview) {
                const url = item.image.preview
                mediaMetadata.set(url, {
                  alt: item.alt || '',
                  credit: item.credit || '',
                  caption: item.caption || '',
                })
              }
            }
          }
        }
      }
    }

    // Also scan author images
    const authorsResult = await this.dbClient.query(`
      SELECT id, image
      FROM authors
      WHERE image IS NOT NULL
    `)

    for (const author of authorsResult.rows) {
      const imageUrl = extractAuthorImageUrl(author.image, STORAGE_BASE_URL)
      if (imageUrl) {
        mediaUrls.add(imageUrl)
        mediaMetadata.set(imageUrl, {
          alt: 'Author profile image',
          credit: '',
          caption: '',
        })
      }
    }

    await this.logger.log(`Found ${mediaUrls.size} unique media files to download`)

    // Download and create Media documents
    let downloadedCount = 0
    for (const url of mediaUrls) {
      const itemKey = `media-${url}`

      if (this.state.itemsCreated[itemKey]) {
        this.idMaps.media.set(url, this.state.itemsCreated[itemKey])
        downloadedCount++
        continue
      }

      try {
        // Download and convert
        const downloadResult = await this.mediaDownloader.downloadAndConvertImage(url)

        // Get metadata
        const metadata = mediaMetadata.get(url) || {
          alt: '',
          credit: '',
          caption: '',
        }

        // Create Media document
        const mediaId = await this.mediaDownloader.createMediaDocument(
          this.payload,
          downloadResult,
          metadata,
          'all'
        )

        this.idMaps.media.set(url, mediaId)
        this.state.itemsCreated[itemKey] = mediaId
        downloadedCount++

        await this.logger.log(`✓ Imported media: ${downloadedCount}/${mediaUrls.size}`)
      } catch (error: any) {
        await this.logger.log(`Error importing media ${url}: ${error.message}`, true)
        throw error // Fail on media import error
      }
    }

    await this.saveState()
    await this.saveIdMappings()
  }

  async importPagesWithContent(tableName: string, translationsTable: string) {
    await this.logger.log(`\n=== Updating ${tableName} with Content ===`)
    this.state.phase = `updating-${tableName}-content`
    await this.saveState()

    const pagesResult = await this.dbClient.query(`
      SELECT
        p.id,
        json_agg(
          json_build_object(
            'locale', pt.locale,
            'content', pt.content
          ) ORDER BY pt.locale
        ) as translations
      FROM ${tableName} p
      LEFT JOIN ${translationsTable} pt ON p.id = pt.${tableName.slice(0, -1)}_id
      WHERE pt.state = 1 AND pt.content IS NOT NULL
      GROUP BY p.id
    `)

    await this.logger.log(`Updating ${pagesResult.rows.length} pages with content`)

    // Get the map for this table
    const mapKey = tableName.replace(/_/g, '').replace(/s$/, '') + 's'
    const pageIdMap = (this.idMaps as unknown as Record<string, Map<number, string>>)[mapKey]

    for (const page of pagesResult.rows) {
      const pageId = pageIdMap.get(page.id)
      if (!pageId) {
        await this.logger.log(`Warning: Page ${page.id} not found in ID map`, true)
        continue
      }

      try {
        // Convert content for each locale
        for (const translation of page.translations) {
          if (!translation.locale || !translation.content) continue

          const locale = translation.locale
          const content = translation.content as EditorJSContent

          // Build conversion context
          const context: ConversionContext = {
            payload: this.payload,
            logger: this.logger,
            pageId: page.id,
            locale,
            mediaMap: this.idMaps.media,
            formMap: this.idMaps.forms,
            externalVideoMap: this.idMaps.externalVideos,
            treatmentMap: this.idMaps.treatments,
            meditationTitleMap: this.meditationTitleMap,
          }

          // Convert EditorJS to Lexical
          const lexicalContent = await convertEditorJSToLexical(content, context)

          // Update page with content
          await this.payload.update({
            collection: 'pages',
            id: pageId,
            data: {
              content: lexicalContent as any,
            },
            locale,
          })
        }

        await this.logger.log(`✓ Updated page ${page.id} -> ${pageId} with content`)
      } catch (error: any) {
        await this.logger.log(
          `Error updating page ${page.id} with content: ${error.message}`,
          true
        )
        throw error // Fail on content conversion error
      }
    }

    await this.saveState()
  }

  // ============================================================================
  // MAIN RUN METHOD
  // ============================================================================

  async run() {
    console.log('\n🚀 Starting WeMediate Import\n')

    try {
      // 1. Setup cache directory
      await fs.mkdir(CACHE_DIR, { recursive: true })
      await fs.mkdir(path.join(CACHE_DIR, 'assets'), { recursive: true })

      // 2. Initialize utilities
      this.logger = new Logger(CACHE_DIR)
      this.fileUtils = new FileUtils(this.logger)

      // 3. Initialize Payload (skip in dry run)
      if (!this.options.dryRun) {
        const payloadConfig = await configPromise
        this.payload = await getPayload({ config: payloadConfig })
        this.tagManager = new TagManager(this.payload, this.logger)
        this.payloadHelpers = new PayloadHelpers(this.payload, this.logger)
        await this.logger.log('✓ Payload CMS initialized')
      }

      // 4. Handle options
      if (this.options.clearCache) {
        await this.logger.log('Clearing cache...')
        await fs.rm(CACHE_DIR, { recursive: true, force: true })
        await fs.mkdir(CACHE_DIR, { recursive: true })
        await fs.mkdir(path.join(CACHE_DIR, 'assets'), { recursive: true })
      }

      if (this.options.reset) {
        await this.resetCollections()
      }

      if (this.options.resume) {
        await this.loadState()
        await this.loadIdMappings()
      }

      // 5. Setup PostgreSQL database
      await this.setupDatabase()

      // Stop here if dry run
      if (this.options.dryRun) {
        await this.logger.log('\n✓ Dry run completed successfully')
        await this.logger.log('Database connection and schema validated')
        return
      }

      // 6. Run two-phase import
      await this.logger.log('\n=== PHASE 1: Metadata Import ===\n')

      // Phase 1: Import metadata without content
      await this.importAuthors()
      await this.importCategories()
      await this.importContentTypeTags()

      // Import article type tags
      for (const articleType of Object.values(ARTICLE_TYPE_TAGS)) {
        const itemKey = `content-type-tag-${articleType}`
        if (!this.state.itemsCreated[itemKey]) {
          try {
            const tagDoc = await this.payload.create({
              collection: 'page-tags',
              data: {
                name: articleType,
                title: articleType,
              },
            })
            this.state.itemsCreated[itemKey] = tagDoc.id as string
          } catch {
            // Might already exist
          }
        }
      }

      // Import pages metadata only (no content conversion yet)
      await this.importPages('static_pages', 'static_page_translations')
      await this.importPages('articles', 'article_translations')
      await this.importPromoPages() // Different structure - no translations table
      await this.importPages('subtle_system_nodes', 'subtle_system_node_translations')
      await this.importPages('treatments', 'treatment_translations')

      await this.saveIdMappings()

      await this.logger.log('\n=== PHASE 2: Content Import ===\n')

      // Phase 2: Import content with full conversion
      await this.buildMeditationTitleMap()
      await this.importForms()
      await this.importMedia()
      await this.importExternalVideos()

      // Update pages with converted Lexical content
      await this.importPagesWithContent('static_pages', 'static_page_translations')
      await this.importPagesWithContent('articles', 'article_translations')
      await this.importPromoPagesWithContent() // Different structure - no translations table
      await this.importPagesWithContent('subtle_system_nodes', 'subtle_system_node_translations')
      await this.importPagesWithContent('treatments', 'treatment_translations')

      await this.saveIdMappings()

      // 7. Cleanup database
      await this.cleanupDatabase()

      await this.logger.log('\n=== Import Complete ===')
      await this.logger.log(`Created ${Object.keys(this.state.itemsCreated).length} items`)
      if (this.state.failed.length > 0) {
        await this.logger.log(`\nFailed operations: ${this.state.failed.length}`)
        this.state.failed.forEach((msg) => this.logger.log(`  - ${msg}`))
      }
    } catch (error: any) {
      await this.logger.log(`Fatal error: ${error.message}`, true)
      console.error('Fatal error:', error)

      // Try to cleanup database on error
      try {
        await this.cleanupDatabase()
      } catch {
        // Ignore cleanup errors
      }

      throw error
    }
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  const args = process.argv.slice(2)
  const options: ScriptOptions = {
    dryRun: args.includes('--dry-run'),
    reset: args.includes('--reset'),
    resume: args.includes('--resume'),
    clearCache: args.includes('--clear-cache'),
  }

  // Validate required environment variables
  const requiredEnvVars = ['DATABASE_URI', 'PAYLOAD_SECRET']
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.error(`Error: ${envVar} environment variable is required`)
      process.exit(1)
    }
  }

  // Check if data.bin exists
  try {
    await fs.access(DATA_BIN)
  } catch {
    console.error(`Error: Data file not found at ${DATA_BIN}`)
    process.exit(1)
  }

  const importer = new WeMeditateImporter(options)
  await importer.run()
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
