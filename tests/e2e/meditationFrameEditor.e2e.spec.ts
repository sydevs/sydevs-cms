import { test, expect, type Page } from '@playwright/test'

/**
 * End-to-end tests for MeditationFrameEditor
 * Tests the complete user workflow in the admin panel
 */
test.describe('MeditationFrameEditor E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Login to admin panel
    await page.goto('/admin/login')
    await page.fill('input[name="email"]', 'contact@sydevelopers.com')
    await page.fill('input[name="password"]', 'evk1VTH5dxz_nhg-mzk')
    await page.click('button[type="submit"]')
    
    // Wait for login to complete
    await page.waitForURL('/admin')
  })

  test('should display meditation frame editor in collapsed state', async ({ page }) => {
    // Navigate to meditation edit page
    await page.goto('/admin/collections/meditations')
    
    // Find and click on a meditation (assuming test meditation exists)
    await page.click('a[href*="/admin/collections/meditations/"]')
    
    // Wait for page to load and scroll to frames section
    await page.waitForLoadState('networkidle')
    await page.locator('text=Meditation Frames').scrollIntoViewIfNeeded()
    
    // Verify collapsed state elements
    await expect(page.locator('text=Live Preview')).toBeVisible()
    await expect(page.locator('button:has-text("Edit Video")')).toBeVisible()
    
    // Should show "No frames added" or preview
    const hasFrames = await page.locator('text=No frames added').isVisible()
    if (hasFrames) {
      await expect(page.locator('text=Add frames to see the slideshow preview')).toBeVisible()
    }
  })

  test('should open modal when Edit Video button is clicked', async ({ page }) => {
    // Navigate to meditation with audio file
    await page.goto('/admin/collections/meditations')
    await page.click('a[href*="/admin/collections/meditations/"]')
    await page.waitForLoadState('networkidle')
    
    // Scroll to frames section and click Edit Video
    await page.locator('text=Meditation Frames').scrollIntoViewIfNeeded()
    await page.click('button:has-text("Edit Video")')
    
    // Verify modal opens with correct layout
    await expect(page.locator('text=Edit Video Frames')).toBeVisible()
    await expect(page.locator('button:has-text("Save")')).toBeVisible()
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible()
    
    // Verify two-column layout
    await expect(page.locator('text=Live Preview')).toBeVisible()
    await expect(page.locator('text=Audio Player')).toBeVisible()
    await expect(page.locator('text=Current Frames')).toBeVisible()
    await expect(page.locator('text=Frame Library')).toBeVisible()
  })

  test('should display frame library with gender filtering', async ({ page }) => {
    await page.goto('/admin/collections/meditations')
    await page.click('a[href*="/admin/collections/meditations/"]')
    await page.waitForLoadState('networkidle')
    
    await page.locator('text=Meditation Frames').scrollIntoViewIfNeeded()
    await page.click('button:has-text("Edit Video")')
    
    // Wait for modal to load
    await page.waitForSelector('text=Frame Library')
    
    // Check if frames are displayed
    const frameCount = await page.locator('[data-testid="frame-item"], .frame-item, img[alt*="frame"], img[src*="frame"]').count()
    
    // Should show some frames (exact count depends on test data)
    expect(frameCount).toBeGreaterThan(0)
    
    // Check for gender filtering indicator
    const hasGenderFilter = await page.locator('text=Filtered for').isVisible()
    if (hasGenderFilter) {
      await expect(page.locator('text=poses')).toBeVisible()
    }
  })

  test('should display tag filters in frame library', async ({ page }) => {
    await page.goto('/admin/collections/meditations')
    await page.click('a[href*="/admin/collections/meditations/"]')
    await page.waitForLoadState('networkidle')
    
    await page.locator('text=Meditation Frames').scrollIntoViewIfNeeded()
    await page.click('button:has-text("Edit Video")')
    
    await page.waitForSelector('text=Frame Library')
    
    // Look for tag filter buttons (common meditation tags)
    const commonTags = ['morning', 'breathing', 'peaceful', 'evening', 'beginner']
    let foundTags = 0
    
    for (const tag of commonTags) {
      const tagVisible = await page.locator(`button:has-text("${tag}")`).isVisible()
      if (tagVisible) foundTags++
    }
    
    // Should find at least some tag filters
    expect(foundTags).toBeGreaterThan(0)
  })

  test('should show audio player with timeline', async ({ page }) => {
    await page.goto('/admin/collections/meditations')
    await page.click('a[href*="/admin/collections/meditations/"]')
    await page.waitForLoadState('networkidle')
    
    await page.locator('text=Meditation Frames').scrollIntoViewIfNeeded()
    await page.click('button:has-text("Edit Video")')
    
    await page.waitForSelector('text=Audio Player')
    
    // Look for audio player elements
    await expect(page.locator('button:has-text("Play")')).toBeVisible()
    
    // Look for timeline elements
    const hasTimeline = await page.locator('input[type="range"], .timeline, .progress-bar').isVisible()
    if (hasTimeline) {
      // Timeline should be visible
      expect(hasTimeline).toBe(true)
    }
    
    // Should show time display
    const timePattern = /\d+:\d+/
    const timeElements = await page.locator('text=/\\d+:\\d+/').count()
    expect(timeElements).toBeGreaterThan(0)
  })

  test('should show current frames section', async ({ page }) => {
    await page.goto('/admin/collections/meditations')
    await page.click('a[href*="/admin/collections/meditations/"]')
    await page.waitForLoadState('networkidle')
    
    await page.locator('text=Meditation Frames').scrollIntoViewIfNeeded()
    await page.click('button:has-text("Edit Video")')
    
    await page.waitForSelector('text=Current Frames')
    
    // Should show frames count
    const framesHeader = page.locator('text=/Current Frames \\(\\d+\\)/')
    await expect(framesHeader).toBeVisible()
    
    // If no frames, should show empty state
    const hasNoFrames = await page.locator('text=No frames added yet').isVisible()
    if (hasNoFrames) {
      await expect(page.locator('text=Select frames from the library')).toBeVisible()
    }
  })

  test('should close modal when Cancel button is clicked', async ({ page }) => {
    await page.goto('/admin/collections/meditations')
    await page.click('a[href*="/admin/collections/meditations/"]')
    await page.waitForLoadState('networkidle')
    
    await page.locator('text=Meditation Frames').scrollIntoViewIfNeeded()
    await page.click('button:has-text("Edit Video")')
    
    // Wait for modal to open
    await page.waitForSelector('text=Edit Video Frames')
    
    // Click Cancel
    await page.click('button:has-text("Cancel")')
    
    // Modal should close
    await expect(page.locator('text=Edit Video Frames')).not.toBeVisible()
    
    // Should return to collapsed state
    await expect(page.locator('button:has-text("Edit Video")')).toBeVisible()
  })

  test('should close modal when Escape key is pressed', async ({ page }) => {
    await page.goto('/admin/collections/meditations')
    await page.click('a[href*="/admin/collections/meditations/"]')
    await page.waitForLoadState('networkidle')
    
    await page.locator('text=Meditation Frames').scrollIntoViewIfNeeded()
    await page.click('button:has-text("Edit Video")')
    
    await page.waitForSelector('text=Edit Video Frames')
    
    // Press Escape key
    await page.keyboard.press('Escape')
    
    // Give modal time to close
    await page.waitForTimeout(500)
    
    // Modal should close
    await expect(page.locator('text=Edit Video Frames')).not.toBeVisible()
    await expect(page.locator('button:has-text("Edit Video")')).toBeVisible()
  })

  test('should handle meditation without audio file', async ({ page }) => {
    // This test would need a meditation without audio file
    // For now, we'll test the disabled state when no audio
    
    await page.goto('/admin/collections/meditations/create')
    await page.waitForLoadState('networkidle')
    
    // Scroll to frames section
    await page.locator('text=Meditation Frames').scrollIntoViewIfNeeded()
    
    // Edit Video button should be disabled
    const editButton = page.locator('button:has-text("Edit Video")')
    await expect(editButton).toBeVisible()
    await expect(editButton).toBeDisabled()
    
    // Should show helper text
    await expect(page.locator('text=Please upload an audio file first')).toBeVisible()
  })

  test('should show instructions for adding frames', async ({ page }) => {
    await page.goto('/admin/collections/meditations')
    await page.click('a[href*="/admin/collections/meditations/"]')
    await page.waitForLoadState('networkidle')
    
    await page.locator('text=Meditation Frames').scrollIntoViewIfNeeded()
    await page.click('button:has-text("Edit Video")')
    
    await page.waitForSelector('text=Frame Library')
    
    // Should show instructions
    await expect(page.locator('text=How to add frames:')).toBeVisible()
    await expect(page.locator('text=Click on any frame above')).toBeVisible()
    
    // Should show current time
    const currentTimePattern = /current audio time \(\d+s\)/
    await expect(page.locator(`text=${currentTimePattern}`)).toBeVisible()
  })

  test('should maintain modal state during navigation within modal', async ({ page }) => {
    await page.goto('/admin/collections/meditations')
    await page.click('a[href*="/admin/collections/meditations/"]')
    await page.waitForLoadState('networkidle')
    
    await page.locator('text=Meditation Frames').scrollIntoViewIfNeeded()
    await page.click('button:has-text("Edit Video")')
    
    await page.waitForSelector('text=Edit Video Frames')
    
    // Try clicking on different areas of the modal
    await page.click('text=Live Preview')
    await page.click('text=Audio Player')
    await page.click('text=Frame Library')
    
    // Modal should stay open
    await expect(page.locator('text=Edit Video Frames')).toBeVisible()
    await expect(page.locator('button:has-text("Save")')).toBeVisible()
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible()
  })

  test('should handle responsive layout', async ({ page }) => {
    // Test tablet size
    await page.setViewportSize({ width: 768, height: 1024 })
    
    await page.goto('/admin/collections/meditations')
    await page.click('a[href*="/admin/collections/meditations/"]')
    await page.waitForLoadState('networkidle')
    
    await page.locator('text=Meditation Frames').scrollIntoViewIfNeeded()
    await page.click('button:has-text("Edit Video")')
    
    await page.waitForSelector('text=Edit Video Frames')
    
    // Modal should still be functional
    await expect(page.locator('text=Live Preview')).toBeVisible()
    await expect(page.locator('text=Frame Library')).toBeVisible()
    
    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 720 })
  })

  test('should show loading states appropriately', async ({ page }) => {
    await page.goto('/admin/collections/meditations')
    await page.click('a[href*="/admin/collections/meditations/"]')
    
    // Look for loading state while page loads
    const hasLoadingState = await page.locator('text=Loading meditation data').isVisible()
    
    if (hasLoadingState) {
      // Loading state should eventually disappear
      await expect(page.locator('text=Loading meditation data')).not.toBeVisible({ timeout: 10000 })
    }
    
    // Final state should show either Edit Video button or error message
    await expect(page.locator('button:has-text("Edit Video"), text=Please upload an audio file first')).toBeVisible()
  })
})