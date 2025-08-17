#!/usr/bin/env tsx

import { config as dotenvConfig } from 'dotenv'
import { getPayload } from 'payload'
import configPromise from '../../payload.config'
import chalk from 'chalk'
import { execSync } from 'child_process'
import { Client } from 'pg'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

// Load environment variables
dotenvConfig()

interface ImportedData {
  tags: Array<{ id: number; name: string }>
  frames: Array<{ id: number; category: string; tags: string }>
  meditations: Array<{ 
    id: number; 
    title: string; 
    duration?: number; 
    published: boolean;
    narrator: number;
    music_tag?: string;
  }>
  musics: Array<{ 
    id: number; 
    title: string; 
    duration?: number; 
    credit?: string;
  }>
  keyframes: Array<{
    media_type: string;
    media_id: number;
    frame_id: number;
    seconds?: number;
  }>
  attachments: Array<{
    name: string;
    record_type: string;
    record_id: number;
    blob_id: number;
  }>
  blobs: Array<{
    id: number;
    key: string;
    filename: string;
    content_type: string;
    byte_size: number;
  }>
}

class SimpleImporter {
  private payload: any
  private tempDb: Client
  private tempDir: string
  private idMaps = {
    tags: new Map<number, string>(),
    frames: new Map<number, string>(),
    meditations: new Map<number, string>(),
    musics: new Map<number, string>(),
    narrators: new Map<number, string>(),
  }

  constructor() {
    this.tempDb = new Client({
      host: 'localhost',
      port: 5432,
      database: 'temp_migration',
      user: process.env.USER || 'postgres',
      password: '',
    })
    this.tempDir = path.join(os.tmpdir(), 'payload-migration-files')
  }

  async run() {
    console.log(chalk.blue('\n🚀 Simple Migration from Heroku Postgres Dump\n'))

    try {
      // 1. Import dump to temporary database
      await this.setupTempDatabase()

      // 2. Initialize Payload
      console.log('Initializing Payload CMS...')
      const payloadConfig = await configPromise
      this.payload = await getPayload({ config: payloadConfig })
      console.log('✓ Payload CMS initialized')

      // 3. Setup file handling
      await this.setupFileDirectory()

      // 4. Load data from temp database
      const data = await this.loadData()

      // 5. Import in order
      await this.importNarrators()
      await this.importTags(data.tags)
      await this.importFrames(data.frames, data.tags, data.attachments, data.blobs)
      await this.importMusic(data.musics, data.attachments, data.blobs)
      await this.importMeditations(data.meditations, data.keyframes, data.attachments, data.blobs)

      console.log(chalk.green('\n✅ Migration completed successfully!'))

    } catch (error) {
      console.error(chalk.red('\n❌ Migration failed:'), error)
    } finally {
      await this.cleanup()
    }
  }

  private async setupTempDatabase() {
    console.log('Setting up temporary database...')
    
    try {
      // Create temp database
      execSync('createdb temp_migration 2>/dev/null || true')
      
      // Import the dump
      execSync(`pg_restore -d temp_migration --clean --if-exists src/scripts/migration/data.bin`)
      
      // Connect to temp database
      await this.tempDb.connect()
      console.log('✓ Data imported to temporary database')
    } catch (error) {
      console.error('Failed to setup temp database:', error)
      throw error
    }
  }

  private async loadData(): Promise<ImportedData> {
    console.log('Loading data from temporary database...')

    const [tags, frames, meditations, musics, keyframes, attachments, blobs] = await Promise.all([
      this.tempDb.query('SELECT id, name FROM tags ORDER BY id'),
      this.tempDb.query('SELECT id, category, tags FROM frames ORDER BY id'),
      this.tempDb.query('SELECT id, title, duration, published, narrator, music_tag FROM meditations WHERE published = true ORDER BY id'),
      this.tempDb.query('SELECT id, title, duration, credit FROM musics ORDER BY id'),
      this.tempDb.query('SELECT media_type, media_id, frame_id, seconds FROM keyframes WHERE media_type = \'Meditation\' ORDER BY media_id, seconds'),
      this.tempDb.query('SELECT name, record_type, record_id, blob_id FROM active_storage_attachments'),
      this.tempDb.query('SELECT id, key, filename, content_type, byte_size FROM active_storage_blobs'),
    ])

    console.log(`✓ Loaded: ${tags.rows.length} tags, ${frames.rows.length} frames, ${meditations.rows.length} meditations, ${musics.rows.length} music tracks`)

    return {
      tags: tags.rows,
      frames: frames.rows,
      meditations: meditations.rows,
      musics: musics.rows,
      keyframes: keyframes.rows,
      attachments: attachments.rows,
      blobs: blobs.rows,
    }
  }

  private async setupFileDirectory() {
    await fs.mkdir(this.tempDir, { recursive: true })
    console.log(`✓ Created temp directory: ${this.tempDir}`)
  }

  private async downloadFile(storageKey: string, filename: string): Promise<string | null> {
    try {
      // You'll need to replace this URL pattern with your actual storage URL
      // This is likely Google Cloud Storage or AWS S3
      const baseUrl = process.env.STORAGE_BASE_URL || 'https://storage.googleapis.com/media.sydevelopers.com'
      const fileUrl = `${baseUrl}/${storageKey}`
      
      console.log(`  Downloading: ${filename}`)
      
      const response = await fetch(fileUrl)
      if (!response.ok) {
        console.warn(`  ⚠️  Failed to download ${filename}: ${response.status}`)
        return null
      }

      const buffer = await response.arrayBuffer()
      const localPath = path.join(this.tempDir, `${storageKey}_${filename}`)
      await fs.writeFile(localPath, Buffer.from(buffer))
      
      return localPath
    } catch (error) {
      console.warn(`  ⚠️  Error downloading ${filename}:`, error)
      return null
    }
  }

  private async uploadToPayload(localPath: string, collection: string, metadata: any = {}): Promise<any> {
    try {
      const fileBuffer = await fs.readFile(localPath)
      const filename = path.basename(localPath)
      const mimeType = this.getMimeType(filename)

      const result = await this.payload.create({
        collection,
        data: metadata,
        filePath: localPath,
      })

      console.log(`    ✓ Uploaded: ${filename}`)
      return result
    } catch (error) {
      console.warn(`    ⚠️  Failed to upload ${localPath}:`, error)
      return null
    }
  }

  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase()
    const mimeTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
    }
    return mimeTypes[ext] || 'application/octet-stream'
  }

  private getAttachmentsForRecord(recordType: string, recordId: number, attachments: any[], blobs: any[]): any[] {
    return attachments
      .filter(att => att.record_type === recordType && att.record_id === recordId)
      .map(att => {
        const blob = blobs.find(b => b.id === att.blob_id)
        return blob ? { ...att, blob } : null
      })
      .filter(Boolean)
  }

  private async importNarrators() {
    console.log('\nCreating narrators...')
    
    const narrators = [
      { name: 'Female Narrator', gender: 'female', slug: 'female-narrator' },
      { name: 'Male Narrator', gender: 'male', slug: 'male-narrator' },
    ]

    for (let i = 0; i < narrators.length; i++) {
      const created = await this.payload.create({
        collection: 'narrators',
        data: narrators[i],
      })
      this.idMaps.narrators.set(i, created.id)
    }

    console.log(`✓ Created ${narrators.length} narrators`)
  }

  private async importTags(tags: ImportedData['tags']) {
    console.log('\nImporting tags...')
    
    for (const tag of tags) {
      const created = await this.payload.create({
        collection: 'tags',
        data: {
          title: tag.name,
        },
        locale: 'en',
      })
      this.idMaps.tags.set(tag.id, created.id)
    }

    console.log(`✓ Imported ${tags.length} tags`)
  }

  private async importFrames(frames: ImportedData['frames'], allTags: ImportedData['tags'], attachments: any[], blobs: any[]) {
    console.log('\nImporting frames...')
    
    for (const frame of frames) {
      // Parse comma-separated tags
      const frameTagNames = frame.tags
        ? frame.tags.split(',').map(t => t.trim()).filter(Boolean)
        : []
      
      // Find tag IDs
      const tagIds: string[] = []
      for (const tagName of frameTagNames) {
        const tag = allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase())
        if (tag && this.idMaps.tags.has(tag.id)) {
          tagIds.push(this.idMaps.tags.get(tag.id)!)
        }
      }

      // Determine imageSet from category
      const imageSet = this.determineImageSet(frame.category)

      // Get frame attachments (images/videos)
      const frameAttachments = this.getAttachmentsForRecord('Frame', frame.id, attachments, blobs)
      
      let frameData: any = {
        name: `${frame.category} frame`,
        imageSet,
        tags: tagIds,
        legacyId: frame.id,
      }

      // If there are file attachments, upload the first one as the frame image/video
      if (frameAttachments.length > 0) {
        const attachment = frameAttachments[0] // Take first attachment
        const localPath = await this.downloadFile(attachment.blob.key, attachment.blob.filename)
        
        if (localPath) {
          const uploaded = await this.uploadToPayload(localPath, 'frames', frameData)
          if (uploaded) {
            this.idMaps.frames.set(frame.id, uploaded.id)
            continue
          }
        }
      }

      // Create without file if no attachment or upload failed
      const created = await this.payload.create({
        collection: 'frames',
        data: frameData,
      })
      
      this.idMaps.frames.set(frame.id, created.id)
    }

    console.log(`✓ Imported ${frames.length} frames`)
  }

  private determineImageSet(category: string): 'male' | 'female' {
    // You can adjust this logic based on your specific categories
    const femaleCategories = ['female', 'woman', 'goddess']
    return femaleCategories.some(cat => category?.toLowerCase().includes(cat)) ? 'female' : 'male'
  }

  private async importMusic(musics: ImportedData['musics'], attachments: any[], blobs: any[]) {
    console.log('\nImporting music...')
    
    for (const music of musics) {
      const musicData = {
        title: music.title,
        credit: music.credit || '',
        duration: music.duration,
        legacyId: music.id,
      }

      // Get music audio attachments
      const musicAttachments = this.getAttachmentsForRecord('Music', music.id, attachments, blobs)
      const audioAttachment = musicAttachments.find(att => att.name === 'audio')
      
      if (audioAttachment) {
        const localPath = await this.downloadFile(audioAttachment.blob.key, audioAttachment.blob.filename)
        
        if (localPath) {
          const uploaded = await this.uploadToPayload(localPath, 'music', musicData)
          if (uploaded) {
            this.idMaps.musics.set(music.id, uploaded.id)
            continue
          }
        }
      }

      // Create without file if no attachment or upload failed
      const created = await this.payload.create({
        collection: 'music',
        data: musicData,
      })
      
      this.idMaps.musics.set(music.id, created.id)
    }

    console.log(`✓ Imported ${musics.length} music tracks`)
  }

  private async importMeditations(meditations: ImportedData['meditations'], keyframes: ImportedData['keyframes'], attachments: any[], blobs: any[]) {
    console.log('\nImporting meditations...')
    
    for (const meditation of meditations) {
      // Build frames array from keyframes
      const meditationKeyframes = keyframes.filter(kf => kf.media_id === meditation.id)
      const frames = meditationKeyframes.map(kf => ({
        frame: this.idMaps.frames.get(kf.frame_id),
        timestamp: kf.seconds || 0,
      })).filter(f => f.frame) // Only include frames that exist

      // Sort by timestamp
      frames.sort((a, b) => a.timestamp - b.timestamp)

      // Get narrator ID
      const narratorId = this.idMaps.narrators.get(meditation.narrator)

      // Find music tag if specified
      let musicTagId: string | undefined
      if (meditation.music_tag) {
        const musicTag = await this.payload.find({
          collection: 'tags',
          where: {
            title: {
              equals: meditation.music_tag,
            },
          },
          limit: 1,
        })
        
        if (musicTag.docs.length > 0) {
          musicTagId = musicTag.docs[0].id
        }
      }

      // Handle thumbnail and audio attachments
      const meditationAttachments = this.getAttachmentsForRecord('Meditation', meditation.id, attachments, blobs)
      const audioAttachment = meditationAttachments.find(att => att.name === 'audio')
      const artAttachment = meditationAttachments.find(att => att.name === 'art')

      let thumbnailId: string | undefined
      
      // Upload thumbnail if available
      if (artAttachment) {
        const localPath = await this.downloadFile(artAttachment.blob.key, artAttachment.blob.filename)
        if (localPath) {
          const uploaded = await this.uploadToPayload(localPath, 'media', {
            alt: `${meditation.title} thumbnail`,
          })
          if (uploaded) {
            thumbnailId = uploaded.id
          }
        }
      }

      const meditationData = {
        title: meditation.title,
        locale: 'en',
        duration: meditation.duration,
        narrator: narratorId,
        musicTag: musicTagId,
        frames: frames,
        isPublished: meditation.published,
        thumbnail: thumbnailId,
        legacyId: meditation.id,
      }

      // Upload audio and create meditation
      if (audioAttachment) {
        const localPath = await this.downloadFile(audioAttachment.blob.key, audioAttachment.blob.filename)
        
        if (localPath) {
          const uploaded = await this.uploadToPayload(localPath, 'meditations', meditationData)
          if (uploaded) {
            this.idMaps.meditations.set(meditation.id, uploaded.id)
            continue
          }
        }
      }

      // Create without audio file if no attachment or upload failed
      const created = await this.payload.create({
        collection: 'meditations',
        data: meditationData,
      })
      
      this.idMaps.meditations.set(meditation.id, created.id)
    }

    console.log(`✓ Imported ${meditations.length} meditations`)
  }

  private async cleanup() {
    try {
      await this.tempDb.end()
      execSync('dropdb temp_migration 2>/dev/null || true')
      await fs.rm(this.tempDir, { recursive: true, force: true })
      console.log('✓ Cleaned up temporary database and files')
    } catch (error) {
      console.warn('Warning: Could not clean up temp resources')
    }
  }
}

// Run the migration
const importer = new SimpleImporter()
importer.run().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})