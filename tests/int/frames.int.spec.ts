import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Frame, Tag } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment, testDataFactory } from '../utils/testHelpers'

describe('Frames Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testTag1: Tag
  let testTag2: Tag
  let testTag3: Tag

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test tags
    testTag1 = await testDataFactory.createTag(payload, { title: 'yoga' })
    testTag2 = await testDataFactory.createTag(payload, { title: 'poses' })
    testTag3 = await testDataFactory.createTag(payload, { title: 'beginner' })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('creates a frame with image and auto-generated slug', async () => {
    const frame = await testDataFactory.createFrameImage(payload, {
      name: 'Mountain Pose',
      imageSet: 'male',
      tags: [testTag1.id, testTag2.id],
    })

    expect(frame).toBeDefined()
    expect(frame.name).toBe('Mountain Pose')
    expect(frame.slug).toBe('mountain-pose')
    expect(frame.imageSet).toBe('male')
    expect(frame.tags).toHaveLength(2)
    expect(frame.mimeType).toBe('image/jpeg') // Original format preserved for now
    expect(frame.filename).toMatch(/^sample(-\d+)?\.jpg$/)
    expect(frame.filesize).toBeGreaterThan(0)
    // Dimensions should be auto-populated by Payload for images
    expect(frame.width).toBeGreaterThan(0)
    expect(frame.height).toBeGreaterThan(0)
    expect(frame.duration).toBeUndefined() // No duration for images

    // Check tags relationship
    const tagIds = Array.isArray(frame.tags) 
      ? frame.tags.map(tag => typeof tag === 'object' && tag && 'id' in tag ? tag.id : tag)
      : []
    expect(tagIds).toContain(testTag1.id)
    expect(tagIds).toContain(testTag2.id)
  })

  it('creates a frame with video and auto-generated slug', async () => {
    const frame = await testDataFactory.createFrameVideo(payload, {
      name: 'Warrior Pose Flow',
      imageSet: 'female',
      tags: [testTag2.id, testTag3.id],
    })

    expect(frame).toBeDefined()
    expect(frame.name).toBe('Warrior Pose Flow')
    expect(frame.slug).toBe('warrior-pose-flow')
    expect(frame.imageSet).toBe('female')
    expect(frame.tags).toHaveLength(2)
    expect(frame.mimeType).toBe('video/mp4') // Original format preserved for now
    expect(frame.filename).toMatch(/^video(-\d+)?\.mp4$/)
    expect(frame.filesize).toBeGreaterThan(0)
    // Duration is not automatically extracted yet
    expect(frame.duration).toBeUndefined()
    expect(frame.width).toBeUndefined() // No dimensions for videos
    expect(frame.height).toBeUndefined() // No dimensions for videos

    // Check tags relationship
    const tagIds = Array.isArray(frame.tags) 
      ? frame.tags.map(tag => typeof tag === 'object' && tag && 'id' in tag ? tag.id : tag)
      : []
    expect(tagIds).toContain(testTag2.id)
    expect(tagIds).toContain(testTag3.id)
  })

  it('ignores custom slug on create', async () => {
    const frame = await testDataFactory.createFrameImage(payload, {
      name: 'Sun Salutation',
      slug: 'custom-sun-slug', // This should be ignored
    })

    expect(frame.slug).toBe('sun-salutation') // Auto-generated from name
  })

  it('handles special characters in slug generation', async () => {
    const frame = await testDataFactory.createFrameImage(payload, {
      name: 'Namasté: Inner Peace & Harmony',
    })

    expect(frame.slug).toBe('namast-inner-peace-harmony')
  })

  it('requires name field', async () => {
    await expect(
      testDataFactory.createFrameImage(payload, {
        imageSet: 'male',
        name: undefined, // Remove name to test validation
      } as any)
    ).rejects.toThrow()
  })

  it('requires imageSet field', async () => {
    await expect(
      testDataFactory.createFrameImage(payload, {
        name: 'Test Frame',
        imageSet: undefined, // Remove imageSet to test validation
      } as any)
    ).rejects.toThrow()
  })

  it('validates imageSet options', async () => {
    await expect(
      testDataFactory.createFrameImage(payload, {
        name: 'Test Frame',
        imageSet: 'invalid' as any, // Invalid option
      })
    ).rejects.toThrow()
  })

  it('accepts valid image formats (WEBP)', async () => {
    const frame = await testDataFactory.createFrameWithFormat(payload, {
      mimetype: 'image/webp',
      name: 'test.webp',
      filename: 'sample.jpg', // Use JPEG file but claim it's WEBP
    }, {
      name: 'WEBP Format Test',
    })

    expect(frame).toBeDefined()
    expect(frame.name).toBe('WEBP Format Test')
    expect(frame.mimeType).toBe('image/webp')
  })

  it('accepts valid video formats (WEBM)', async () => {
    const frame = await testDataFactory.createFrameWithFormat(payload, {
      mimetype: 'video/webm',
      name: 'test.webm',
      filename: 'video.mp4', // Use MP4 file but claim it's WEBM
    }, {
      name: 'WEBM Format Test',
    })

    expect(frame).toBeDefined()
    expect(frame.name).toBe('WEBM Format Test')
    expect(frame.mimeType).toBe('video/webm')
  })

  it.skip('validates file size limit for images (10MB)', async () => {
    // TODO: File size validation needs to be tested with actual large files
    // The current hook-based approach needs to be verified
    await expect(
      payload.create({
        collection: 'frames',
        data: {
          name: 'Large Image',
          imageSet: 'male',
        },
        file: {
          data: Buffer.alloc(11 * 1024 * 1024, 'fake'), // 11MB - exceeds 10MB limit
          mimetype: 'image/jpeg',
          name: 'large.jpg',
          size: 11 * 1024 * 1024,
        },
      })
    ).rejects.toThrow()
  })

  it.skip('validates file size limit for videos (100MB)', async () => {
    // TODO: File size validation needs to be tested with actual large files
    await expect(
      payload.create({
        collection: 'frames',
        data: {
          name: 'Large Video',
          imageSet: 'female',
        },
        file: {
          data: Buffer.alloc(101 * 1024 * 1024, 'fake'), // 101MB - exceeds 100MB limit
          mimetype: 'video/mp4',
          name: 'large.mp4',
          size: 101 * 1024 * 1024,
        },
      })
    ).rejects.toThrow()
  })

  it.skip('validates video duration limit (30 seconds)', async () => {
    // TODO: Duration validation needs to be tested with actual long video files
    // This requires a sample video longer than 30 seconds
  })

  it('updates a frame', async () => {
    const frame = await testDataFactory.createFrameImage(payload, {
      name: 'Original Name',
      imageSet: 'male',
    })

    const updated = await payload.update({
      collection: 'frames',
      id: frame.id,
      data: {
        name: 'Updated Name',
        imageSet: 'female',
        tags: [testTag3.id],
      },
    }) as Frame

    expect(updated.name).toBe('Updated Name')
    expect(updated.imageSet).toBe('female')
    expect(updated.slug).toBe('original-name') // Slug should not change on update
    expect(updated.tags).toHaveLength(1)
    
    const tagIds = Array.isArray(updated.tags) 
      ? updated.tags.map(tag => typeof tag === 'object' && tag && 'id' in tag ? tag.id : tag)
      : []
    expect(tagIds).toContain(testTag3.id)
  })

  it('preserves slug when updating other fields', async () => {
    const frame = await testDataFactory.createFrameImage(payload, {
      name: 'Unique Slug Preservation Test Name',
    })

    const updated = await payload.update({
      collection: 'frames',
      id: frame.id,
      data: {
        name: 'Updated Name', // Update name instead of slug since slug is admin-only
      },
    }) as Frame

    expect(updated.slug).toBe('unique-slug-preservation-test-name') // Slug remains unchanged
  })

  it('manages tags relationships properly', async () => {
    const frame = await testDataFactory.createFrameImage(payload, {
      name: 'Tagged Frame',
      tags: [testTag1.id, testTag2.id],
    })

    expect(frame.tags).toHaveLength(2)
    
    // Update tags
    const updated = await payload.update({
      collection: 'frames',
      id: frame.id,
      data: {
        tags: [testTag3.id],
      },
    }) as Frame

    expect(updated.tags).toHaveLength(1)
    const updatedTagIds = Array.isArray(updated.tags) 
      ? updated.tags.map(tag => typeof tag === 'object' && tag && 'id' in tag ? tag.id : tag)
      : []
    expect(updatedTagIds).toContain(testTag3.id)
  })

  it('deletes a frame', async () => {
    const frame = await testDataFactory.createFrameImage(payload, {
      name: 'To Delete',
    })

    await payload.delete({
      collection: 'frames',
      id: frame.id,
    })

    // Verify deletion
    const result = await payload.find({
      collection: 'frames',
      where: {
        id: {
          equals: frame.id,
        },
      },
    })

    expect(result.docs).toHaveLength(0)
  })

  it('finds frames with filters', async () => {
    await testDataFactory.createFrameImage(payload, {
      name: 'Filter Test Yoga Frame',
      tags: [testTag1.id], // yoga tag
      imageSet: 'male',
    })

    await testDataFactory.createFrameVideo(payload, {
      name: 'Filter Test Beginner Frame',
      tags: [testTag3.id], // beginner tag
      imageSet: 'female',
    })

    // Find frames with yoga tag AND specific name to avoid conflicts with other tests
    const result = await payload.find({
      collection: 'frames',
      where: {
        and: [
          {
            tags: {
              in: [testTag1.id],
            },
          },
          {
            name: {
              like: 'Filter Test Yoga',
            },
          },
        ],
      },
    })

    expect(result.docs).toHaveLength(1)
    expect(result.docs[0].name).toBe('Filter Test Yoga Frame')
  })

  it('finds frames by imageSet', async () => {
    await testDataFactory.createFrameImage(payload, {
      name: 'Male Frame Test',
      imageSet: 'male',
    })

    await testDataFactory.createFrameVideo(payload, {
      name: 'Female Frame Test',
      imageSet: 'female',
    })

    const maleFrames = await payload.find({
      collection: 'frames',
      where: {
        and: [
          {
            imageSet: {
              equals: 'male',
            },
          },
          {
            name: {
              like: 'Male Frame Test',
            },
          },
        ],
      },
    })

    expect(maleFrames.docs).toHaveLength(1)
    expect(maleFrames.docs[0].imageSet).toBe('male')
  })

  it('enforces unique slug constraint', async () => {
    await testDataFactory.createFrameImage(payload, {
      name: 'Duplicate Test',
    })

    await expect(
      testDataFactory.createFrameImage(payload, {
        name: 'Duplicate Test', // Same name will generate same slug
      })
    ).rejects.toThrow()
  })

  it('supports mixed media types in same collection', async () => {
    const imageFrame = await testDataFactory.createFrameImage(payload, {
      name: 'Mixed Test Image',
    })

    const videoFrame = await testDataFactory.createFrameVideo(payload, {
      name: 'Mixed Test Video',
    })

    expect(imageFrame.mimeType).toBe('image/jpeg')
    expect(imageFrame.width).toBeGreaterThan(0)
    expect(imageFrame.height).toBeGreaterThan(0)
    expect(imageFrame.duration).toBeUndefined()

    expect(videoFrame.mimeType).toBe('video/mp4')
    expect(videoFrame.duration).toBeUndefined() // Not yet implemented
    expect(videoFrame.width).toBeUndefined()
    expect(videoFrame.height).toBeUndefined()
  })
})