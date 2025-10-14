#!/usr/bin/env tsx

import 'dotenv/config'
import { CollectionSlug, getPayload, Payload } from 'payload'
import configPromise from '../../src/payload.config'
import { execSync } from 'child_process'
import { Client } from 'pg'
import { promises as fs } from 'fs'
import * as path from 'path'
import { Logger, FileUtils, TagManager, PayloadHelpers } from '../lib'

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
        this.idMaps[key as keyof IdMaps] = new Map(Object.entries(value))
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
            'text', at.text
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
              description: translation.text || '',
            }
          }
        }

        if (Object.keys(localizedData).length === 0) {
          await this.logger.log(`Skipping author ${author.id}: no valid translations`, true)
          continue
        }

        // Create author document
        const authorDoc = await this.payload.create({
          collection: 'authors',
          data: {
            name: localizedData[Object.keys(localizedData)[0]].name,
            title: localizedData[Object.keys(localizedData)[0]].title,
            description: localizedData[Object.keys(localizedData)[0]].description,
            country_code: author.country_code || undefined,
            years_meditating: author.years_meditating || undefined,
          },
          locale: 'all' as any,
        })

        this.idMaps.authors.set(author.id, authorDoc.id as string)
        this.state.itemsCreated[itemKey] = authorDoc.id as string
        await this.logger.log(`✓ Created author: ${author.id} -> ${authorDoc.id}`)
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

        const firstLocale = Object.keys(localizedData)[0]

        // Create page tag
        const tagDoc = await this.payload.create({
          collection: 'page-tags',
          data: {
            name: localizedData[firstLocale].name,
            title: localizedData[firstLocale].title,
          },
          locale: 'all' as any,
        })

        this.idMaps.categories.set(category.id, tagDoc.id as string)
        this.state.itemsCreated[itemKey] = tagDoc.id as string
        await this.logger.log(`✓ Created category tag: ${category.id} -> ${tagDoc.id}`)
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

    const pagesResult = await this.dbClient.query(`
      SELECT
        p.id,
        p.author_id,
        p.article_type,
        p.category_id,
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
      GROUP BY p.id, p.author_id, p.article_type, p.category_id
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
      this.fileUtils = new FileUtils(CACHE_DIR, this.logger)
      this.payloadHelpers = new PayloadHelpers(this.logger)

      // 3. Initialize Payload (skip in dry run)
      if (!this.options.dryRun) {
        const payloadConfig = await configPromise
        this.payload = await getPayload({ config: payloadConfig })
        this.tagManager = new TagManager(this.payload, this.logger)
        this.payloadHelpers.setPayload(this.payload)
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

      // 6. Run import steps
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

      await this.importPages('static_pages', 'static_page_translations')
      await this.importPages('articles', 'article_translations')
      await this.importPages('promo_pages', 'promo_page_translations')
      await this.importPages('subtle_system_nodes', 'subtle_system_node_translations')
      await this.importPages('treatments', 'treatment_translations')

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
