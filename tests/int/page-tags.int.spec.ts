import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { PageTag, Page } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'
import { testData } from '../utils/testData'

describe('PageTags Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testTag: PageTag
  let testPage: Page

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test tag
    testTag = await testData.createPageTag(payload, {
      name: 'wisdom-tag',
      title: 'Wisdom',
    })

    // Create test page with the tag
    testPage = await testData.createPage(payload, {
      title: 'Test Page with Tags',
      tags: [testTag.id],
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('creates a page tag with name and localized title', async () => {
    expect(testTag).toBeDefined()
    expect(testTag.name).toBe('wisdom-tag')
    expect(testTag.title).toBe('Wisdom')
    expect(testTag.id).toBeDefined()
  })

  it('supports bidirectional relationship with pages', async () => {
    // Fetch the tag with populated pages
    const tagWithPages = await payload.findByID({
      collection: 'page-tags',
      id: testTag.id,
      depth: 1,
    })

    expect(tagWithPages.pages).toBeDefined()
    expect(tagWithPages.pages?.docs).toBeDefined()
    expect(tagWithPages.pages?.docs.length).toBeGreaterThan(0)

    // Verify the page is in the join relationship
    const pageIds = tagWithPages.pages?.docs.map((p) => (typeof p === 'object' ? p.id : p)) || []
    expect(pageIds).toContain(testPage.id)
  })

  it('allows pages to have multiple tags', async () => {
    const tag2 = await testData.createPageTag(payload, {
      name: 'living-tag',
      title: 'Living',
    })

    const pageWithMultipleTags = await testData.createPage(payload, {
      title: 'Multi-tag Page',
      tags: [testTag.id, tag2.id],
    })

    expect(pageWithMultipleTags.tags).toHaveLength(2)
    const tagIds = pageWithMultipleTags.tags?.map((tag) =>
      typeof tag === 'object' && tag ? tag.id : tag,
    ) || []
    expect(tagIds).toContain(testTag.id)
    expect(tagIds).toContain(tag2.id)
  })

  it('supports localized title field', async () => {
    const localizedTag = await payload.create({
      collection: 'page-tags',
      data: {
        name: 'events-tag',
        title: 'Events',
      },
      locale: 'en',
    })

    expect(localizedTag.title).toBe('Events')

    // Update with Czech title
    const updatedTag = await payload.update({
      collection: 'page-tags',
      id: localizedTag.id,
      data: {
        title: 'Události',
      },
      locale: 'cs',
    })

    expect(updatedTag.title).toBe('Události')

    // Verify English title is still preserved
    const enTag = await payload.findByID({
      collection: 'page-tags',
      id: localizedTag.id,
      locale: 'en',
    })
    expect(enTag.title).toBe('Events')
  })

  it('uses permission-based access control', async () => {
    // Test that the collection uses the pages permission
    const config = payload.collections['page-tags'].config
    expect(config.access).toBeDefined()
    expect(typeof config.access?.read).toBe('function')
  })

  it('is hidden in admin navigation', async () => {
    const config = payload.collections['page-tags'].config
    expect(config.admin?.hidden).toBe(true)
  })

  it('uses name as title in admin', async () => {
    const config = payload.collections['page-tags'].config
    expect(config.admin?.useAsTitle).toBe('name')
  })

  it('tracks client usage with hook', async () => {
    const config = payload.collections['page-tags'].config
    expect(config.hooks?.afterRead).toBeDefined()
    expect(config.hooks?.afterRead?.length).toBeGreaterThan(0)
  })
})
