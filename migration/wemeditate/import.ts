#!/usr/bin/env tsx

import 'dotenv/config'
import { CollectionSlug, getPayload, Payload } from 'payload'
import configPromise from '../../src/payload.config'
import { execSync } from 'child_process'
import { Client } from 'pg'
import { promises as fs } from 'fs'
import * as path from 'path'
import { Logger, FileUtils, TagManager, PayloadHelpers, MediaUploader } from '../lib'
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

const LOCALES = [
  'en',
  'es',
  'de',
  'it',
  'fr',
  'ru',
  'ro',
  'cs',
  'uk',
  'el',
  'hy',
  'pl',
  'pt-br',
  'fa',
  'bg',
  'tr',
]
const DB_NAME = 'temp_wemeditate_import'

// ============================================================================
// TYPES
// ============================================================================

interface ScriptOptions {
  dryRun: boolean
  reset: boolean
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

interface ImportSummary {
  authorsCreated: number
  categoriesCreated: number
  pagesCreated: number
  mediaCreated: number
  externalVideosCreated: number
  formsCreated: number
  errors: string[]
  warnings: string[]
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
  private mediaUploader!: MediaUploader

  private dbClient!: Client
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
  private contentTypeTagMap: Map<string, string> = new Map()

  // Summary tracking
  private summary: ImportSummary = {
    authorsCreated: 0,
    categoriesCreated: 0,
    pagesCreated: 0,
    mediaCreated: 0,
    externalVideosCreated: 0,
    formsCreated: 0,
    errors: [],
    warnings: [],
  }

  constructor(options: ScriptOptions) {
    this.options = options
  }

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  private addError(context: string, error: Error | string) {
    const message = error instanceof Error ? error.message : error
    const fullMessage = `${context}: ${message}`
    this.summary.errors.push(fullMessage)
    this.logger.error(fullMessage)
  }

  private addWarning(message: string) {
    this.summary.warnings.push(message)
    this.logger.warn(message)
  }

  // ============================================================================
  // DATABASE MANAGEMENT
  // ============================================================================

  private async setupDatabase() {
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

  private async cleanupDatabase() {
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

  private async resetCollections() {
    await this.logger.log('\n=== Resetting Collections ===')

    // Collections with 'tags' relationship field
    const taggedCollections: Array<{ collection: CollectionSlug; tagField: string }> = [
      { collection: 'authors', tagField: 'tags' },
      { collection: 'pages', tagField: 'tags' },
      { collection: 'page-tags', tagField: 'tags' },
      { collection: 'media', tagField: 'tags' },
      { collection: 'external-videos', tagField: 'tags' },
    ]

    // First, get the import tag ID
    let importTagId: string | null = null
    try {
      const importTags = await this.payload.find({
        collection: 'media-tags',
        where: { slug: { equals: IMPORT_TAG } },
        limit: 1,
      })
      if (importTags.docs.length > 0) {
        importTagId = String(importTags.docs[0].id)
      }
    } catch (_error) {
      await this.logger.warn('Could not find import tag, skipping tagged collections reset')
    }

    // Reset tagged collections
    if (importTagId) {
      for (const { collection, tagField } of taggedCollections) {
        try {
          const deletedCount = await this.payloadHelpers.resetCollectionByTag(
            collection,
            tagField,
            importTagId,
          )
          if (deletedCount > 0) {
            await this.logger.log(`✓ Deleted ${deletedCount} documents from ${collection}`)
          } else {
            await this.logger.log(`✓ No documents with import tag in ${collection}`)
          }
        } catch (error) {
          await this.logger.warn(
            `Could not reset ${collection}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }

    // Reset form submissions (no tags field, delete all)
    try {
      const deletedCount = await this.payloadHelpers.resetCollection('pages')
      if (deletedCount > 0) {
        await this.logger.log(`✓ Deleted ${deletedCount} pages`)
      }
    } catch (_error) {
      await this.logger.warn('Could not reset pages')
    }

    // Reset form submissions (no tags field, delete all)
    try {
      const deletedCount = await this.payloadHelpers.resetCollection('form-submissions')
      if (deletedCount > 0) {
        await this.logger.log(`✓ Deleted ${deletedCount} form submissions`)
      }
    } catch (_error) {
      await this.logger.warn('Could not reset form submissions')
    }

    // Reset forms (no tags field, delete all)
    try {
      const deletedCount = await this.payloadHelpers.resetCollection('forms')
      if (deletedCount > 0) {
        await this.logger.log(`✓ Deleted ${deletedCount} forms`)
      }
    } catch (_error) {
      await this.logger.warn('Could not reset forms')
    }

    await this.logger.log('✓ Reset complete')
  }

  // ============================================================================
  // IMPORT METHODS
  // ============================================================================

  private async importAuthors() {
    await this.logger.log('\n=== Importing Authors ===')

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
      try {
        // Build localized data - only include supported locales
        const localizedData: any = {}
        for (const translation of author.translations) {
          // Filter to only supported locales and require at least a name
          if (translation.locale && translation.name && LOCALES.includes(translation.locale)) {
            localizedData[translation.locale] = {
              name: translation.name,
              title: translation.title || '',
              description: translation.description || '',
            }
          }
        }

        if (Object.keys(localizedData).length === 0) {
          await this.logger.log(
            `Skipping author ${author.id}: no translations in supported locales`,
          )
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
        this.summary.authorsCreated++
        await this.logger.log(
          `✓ Created author: ${author.id} -> ${authorDoc.id} (${locales.length} locales)`,
        )
      } catch (error: any) {
        this.addError(`Failed to import author ${author.id}`, error)
      }
    }
  }

  private async importCategories() {
    await this.logger.log('\n=== Importing Categories as Page Tags ===')

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
          this.addWarning(`Skipping category ${category.id}: no valid translations`)
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
        this.summary.categoriesCreated++
        await this.logger.log(
          `✓ Created category tag: ${category.id} -> ${tagDoc.id} (${locales.length} locales)`,
        )
      } catch (error: any) {
        this.addError(`Failed to import category ${category.id}`, error)
      }
    }
  }

  private async importContentTypeTags() {
    await this.logger.log('\n=== Creating Content Type Tags ===')

    for (const [sourceType, tagName] of Object.entries(CONTENT_TYPE_TAGS)) {
      try {
        const tagDoc = await this.payload.create({
          collection: 'page-tags',
          data: {
            name: tagName,
            title: tagName,
          },
        })

        this.contentTypeTagMap.set(`content-type-tag-${tagName}`, tagDoc.id as string)
        await this.logger.log(`✓ Created content type tag: ${tagName}`)
      } catch (error: any) {
        // Tag might already exist
        const existing = await this.payload.find({
          collection: 'page-tags',
          where: { name: { equals: tagName } },
        })
        if (existing.docs.length > 0) {
        }
      }
    }
  }

  private async importPages(tableName: string, translationsTable: string) {
    await this.logger.log(`\n=== Importing ${tableName} ===`)

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
      // Build localized data (outside try block for error reporting)
      const localizedData: any = {}
      for (const translation of page.translations) {
        if (translation.locale && translation.name && translation.state === 1) {
          // Clean slug: trim whitespace and reject if empty
          const slug = translation.slug?.trim()
          localizedData[translation.locale] = {
            title: translation.name,
            slug: slug && slug.length > 0 ? slug : undefined,
            content: translation.content,
            publishAt: translation.published_at,
          }
        }
      }

      try {
        if (Object.keys(localizedData).length === 0) {
          await this.logger.log(`Skipping ${tableName} ${page.id}: no published translations`)
          continue
        }

        // Get author relationship
        let authorId: string | undefined
        if (page.author_id && this.idMaps.authors.has(page.author_id)) {
          authorId = this.idMaps.authors.get(page.author_id)
        }

        // Get tags
        const tags: string[] = []

        // Add content type tag
        const contentTypeTag = CONTENT_TYPE_TAGS[tableName]
        if (contentTypeTag) {
          const tagId = this.contentTypeTagMap.get(`content-type-tag-${contentTypeTag}`)
          if (tagId) {
            tags.push(tagId)
          }
        }

        // Add article type tag
        if (page.article_type !== undefined && ARTICLE_TYPE_TAGS[page.article_type]) {
          const articleTypeTag = ARTICLE_TYPE_TAGS[page.article_type]
          const articleTypeTagKey = `content-type-tag-${articleTypeTag}`
          const tagId = this.contentTypeTagMap.get(articleTypeTagKey)
          if (tagId) {
            tags.push(tagId)
          }
        }

        // Add category tag
        if (page.category_id && this.idMaps.categories.has(page.category_id)) {
          tags.push(this.idMaps.categories.get(page.category_id)!)
        }

        // Create page with first locale
        const locales = Object.keys(localizedData)
        const firstLocale = locales[0] as any

        let pageDoc
        try {
          pageDoc = await this.payload.create({
            collection: 'pages',
            data: {
              title: localizedData[firstLocale].title,
              slug: localizedData[firstLocale].slug, // Already cleaned above
              publishAt: localizedData[firstLocale].publishAt || undefined,
              author: authorId,
              tags: tags.length > 0 ? tags : undefined,
            },
            locale: firstLocale,
          })
        } catch (slugError: any) {
          // If slug validation fails (duplicate), retry without slug to auto-generate
          if (slugError.message && slugError.message.includes('slug')) {
            await this.logger.log(`  Slug conflict for ${tableName} ${page.id}, auto-generating...`)
            pageDoc = await this.payload.create({
              collection: 'pages',
              data: {
                title: localizedData[firstLocale].title,
                slug: undefined, // Let SlugField auto-generate
                publishAt: localizedData[firstLocale].publishAt || undefined,
                author: authorId,
                tags: tags.length > 0 ? tags : undefined,
              },
              locale: firstLocale,
            })
          } else {
            throw slugError
          }
        }

        // Update with other locales
        for (let i = 1; i < locales.length; i++) {
          const locale = locales[i] as any
          await this.payload.update({
            collection: 'pages',
            id: pageDoc.id,
            data: {
              title: localizedData[locale].title,
              // Note: slug is not localized, so we don't update it here
              publishAt: localizedData[locale].publishAt || undefined,
            },
            locale,
          })
        }

        // Store in appropriate id map - convert snake_case to camelCase
        const mapKeyMap: Record<string, string> = {
          static_pages: 'staticPages',
          articles: 'articles',
          subtle_system_nodes: 'subtleSystemNodes',
          treatments: 'treatments',
        }
        const mapKey = mapKeyMap[tableName]
        if (mapKey && mapKey in this.idMaps) {
          ;(this.idMaps as any)[mapKey].set(page.id, pageDoc.id)
        }

        this.summary.pagesCreated++
        await this.logger.log(`✓ Created page from ${tableName}: ${page.id} -> ${pageDoc.id}`)
      } catch (error: any) {
        // Enhanced error logging for slug issues
        if (error.message && error.message.includes('slug')) {
          const locales = Object.keys(localizedData)
          const slugInfo = locales.map((loc) => `${loc}:"${localizedData[loc].slug}"`).join(', ')
          this.addError(`Failed to import ${tableName} ${page.id} [slugs: ${slugInfo}]`, error)
        } else {
          this.addError(`Failed to import ${tableName} ${page.id}`, error)
        }
      }
    }
  }

  private async importPromoPages() {
    await this.logger.log('\n=== Importing promo_pages ===')

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
      // Clean slug outside try block for error reporting
      const slug = page.slug?.trim()

      try {
        // Get tags
        const tags: string[] = []

        // Add content type tag
        const contentTypeTag = CONTENT_TYPE_TAGS['promo_pages']
        if (contentTypeTag) {
          const tagId = this.contentTypeTagMap.get(`content-type-tag-${contentTypeTag}`)
          if (tagId) {
            tags.push(tagId)
          }
        }

        // Create page document
        let pageDoc
        try {
          pageDoc = await this.payload.create({
            collection: 'pages',
            data: {
              title: page.name,
              slug: slug && slug.length > 0 ? slug : undefined, // Let SlugField auto-generate if empty/null
              publishAt: page.published_at || undefined,
              tags,
            },
            locale: page.locale as any,
          })
        } catch (slugError: any) {
          // If slug validation fails (duplicate), retry without slug to auto-generate
          if (slugError.message && slugError.message.includes('slug')) {
            await this.logger.log(`  Slug conflict for promo_page ${page.id}, auto-generating...`)
            pageDoc = await this.payload.create({
              collection: 'pages',
              data: {
                title: page.name,
                slug: undefined, // Let SlugField auto-generate
                publishAt: page.published_at || undefined,
                tags,
              },
              locale: page.locale as any,
            })
          } else {
            throw slugError
          }
        }

        // Store mapping
        const mapKey = `promoPages`
        if (!this.idMaps[mapKey as keyof typeof this.idMaps]) {
          ;(this.idMaps as any)[mapKey] = new Map()
        }
        ;(this.idMaps as unknown as Record<string, Map<number, string>>)[mapKey].set(
          page.id,
          pageDoc.id as string,
        )

        this.summary.pagesCreated++
        await this.logger.log(`✓ Created page from promo_pages: ${page.id} -> ${pageDoc.id}`)
      } catch (error: any) {
        // Enhanced error logging for slug issues
        if (error.message && error.message.includes('slug')) {
          this.addError(`Failed to import promo_pages ${page.id} [slug: "${slug}"]`, error)
        } else {
          this.addError(`Failed to import promo_pages ${page.id}`, error)
        }
      }
    }
  }

  private async importPromoPagesWithContent() {
    await this.logger.log('\n=== Updating promo_pages with Content ===')

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
        this.addWarning(`Promo page ${page.id} not found in ID map`)
        continue
      }

      try {
        const locale = page.locale

        // Skip unsupported locales
        if (!LOCALES.includes(locale)) {
          continue
        }

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
        await this.logger.log(`Error updating promo_page ${page.id} with content: ${error.message}`)
        throw error // Fail on content conversion error
      }
    }
  }

  private async importForms() {
    await this.logger.log('\n=== Creating Shared Forms ===')

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
        this.summary.formsCreated++
        await this.logger.log(`✓ Created form: ${config.title}`)
      } catch (error: any) {
        this.addError(`Failed: creating form ${formType}`, error)
      }
    }
  }

  private async buildMeditationTitleMap() {
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
      this.addError('Failed: building meditation map', error)
    }
  }

  private async importExternalVideos() {
    await this.logger.log('\n=== Scanning for External Videos ===')

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
    for (const videoId of Array.from(videoIds)) {
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
        this.summary.externalVideosCreated++
        await this.logger.log(`✓ Created ExternalVideo: ${videoId}`)
      } catch (error: any) {
        this.addError(`Failed: creating ExternalVideo ${videoId}`, error)
      }
    }
  }

  private async importMedia() {
    await this.logger.log('\n=== Importing Media Files ===')

    // Initialize media downloader and uploader
    this.mediaDownloader = new MediaDownloader(CACHE_DIR, this.logger)
    await this.mediaDownloader.initialize()
    this.mediaUploader = new MediaUploader(this.payload, this.logger)

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
    for (const url of Array.from(mediaUrls)) {
      try {
        // Download and convert
        const downloadResult = await this.mediaDownloader.downloadAndConvertImage(url)

        // Get metadata
        const metadata = mediaMetadata.get(url) || {
          alt: '',
          credit: '',
          caption: '',
        }

        // Upload Media document with deduplication
        const result = await this.mediaUploader.uploadWithDeduplication(downloadResult.localPath, {
          alt: metadata.alt,
          credit: metadata.credit,
          locale: 'all',
        })

        if (result) {
          this.idMaps.media.set(url, result.id)
          if (!result.wasReused) {
            this.summary.mediaCreated++
          }
          downloadedCount++
          await this.logger.log(`✓ Imported media: ${downloadedCount}/${mediaUrls.size}`)
        }
      } catch (error: any) {
        this.addError(`Failed to import media ${url}`, error)
        // Continue with next media item
      }
    }
  }

  private async importPagesWithContent(tableName: string, translationsTable: string) {
    await this.logger.log(`\n=== Updating ${tableName} with Content ===`)

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

    // Get the map for this table - convert snake_case to camelCase
    const mapKeyMap: Record<string, string> = {
      static_pages: 'staticPages',
      articles: 'articles',
      subtle_system_nodes: 'subtleSystemNodes',
      treatments: 'treatments',
    }
    const mapKey = mapKeyMap[tableName]
    const pageIdMap = (this.idMaps as unknown as Record<string, Map<number, string>>)[mapKey]

    for (const page of pagesResult.rows) {
      const pageId = pageIdMap.get(page.id)
      if (!pageId) {
        this.addWarning(`Page ${page.id} not found in ID map`)
        continue
      }

      try {
        // Convert content for each locale
        for (const translation of page.translations) {
          if (!translation.locale || !translation.content) continue

          // Skip unsupported locales
          if (!LOCALES.includes(translation.locale)) {
            continue
          }

          const locale = translation.locale

          // Parse content if it's a string (PostgreSQL returns JSONB as string in json_agg)
          const content =
            typeof translation.content === 'string'
              ? JSON.parse(translation.content)
              : translation.content

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
        this.addError(`Failed: updating page ${page.id} with content`, error)
        // Continue with next page
      }
    }
  }

  // ============================================================================
  // MAIN RUN METHOD
  // ============================================================================

  private printSummary() {
    console.log('\n' + '='.repeat(60))
    console.log('IMPORT SUMMARY')
    console.log('='.repeat(60))

    // Get MediaUploader stats
    const mediaStats = this.mediaUploader.getStats()

    console.log(`\n📊 Records Created:`)
    console.log(`  Authors:            ${this.summary.authorsCreated}`)
    console.log(`  Categories:         ${this.summary.categoriesCreated}`)
    console.log(`  Pages:              ${this.summary.pagesCreated}`)
    console.log(`  Media Files:        ${mediaStats.uploaded}`)
    console.log(`  External Videos:    ${this.summary.externalVideosCreated}`)
    console.log(`  Forms:              ${this.summary.formsCreated}`)

    const totalRecords =
      this.summary.authorsCreated +
      this.summary.categoriesCreated +
      this.summary.pagesCreated +
      mediaStats.uploaded +
      this.summary.externalVideosCreated +
      this.summary.formsCreated

    console.log(`\n  Total Records:      ${totalRecords}`)
    console.log(`  Media Reused:       ${mediaStats.reused}`)

    if (this.summary.warnings.length > 0) {
      console.log(`\n⚠️  Warnings (${this.summary.warnings.length}):`)
      this.summary.warnings.forEach((warning, index) => {
        console.log(`  ${index + 1}. ${warning}`)
      })
    }

    if (this.summary.errors.length > 0) {
      console.log(`\n❌ Errors (${this.summary.errors.length}):`)
      this.summary.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`)
      })
    }

    if (this.summary.errors.length === 0 && this.summary.warnings.length === 0) {
      console.log(`\n✨ No errors or warnings - import completed successfully!`)
    }

    console.log('\n' + '='.repeat(60))
  }

  async run() {
    console.log('\n🚀 Starting WeMeditate Import\n')

    try {
      // 1. Setup cache directory
      await fs.mkdir(CACHE_DIR, { recursive: true })
      await fs.mkdir(path.join(CACHE_DIR, 'assets'), { recursive: true })

      // 2. Initialize utilities
      this.logger = new Logger(CACHE_DIR)
      this.fileUtils = new FileUtils(this.logger)

      // 3. Initialize Payload (always, even for dry run validation)
      const payloadConfig = await configPromise
      this.payload = await getPayload({ config: payloadConfig })
      this.tagManager = new TagManager(this.payload, this.logger)
      this.payloadHelpers = new PayloadHelpers(this.payload, this.logger)
      await this.logger.log('✓ Payload CMS initialized')

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
        if (!this.contentTypeTagMap.has(articleType)) {
          try {
            const tagDoc = await this.payload.create({
              collection: 'page-tags',
              data: {
                name: articleType,
                title: articleType,
              },
            })
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

      // 7. Cleanup database
      await this.cleanupDatabase()

      await this.logger.log('\n=== Import Complete ===')
      this.printSummary()
    } catch (error: any) {
      await this.logger.error(`Fatal error: ${error.message}`)
      console.error('Fatal error:', error)

      // Try to cleanup database on error
      try {
        await this.cleanupDatabase()
      } catch {
        // Ignore cleanup errors
      }

      throw error
    } finally {
      // Ensure Payload cleanup
      if (this.payload?.db?.destroy) {
        await this.payload.db.destroy()
      }
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
  process.exit(0)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
