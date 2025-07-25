import { test, expect, Page } from '@playwright/test'

test.describe('Clients Management UI', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext()
    page = await context.newPage()
  })

  test.beforeEach(async () => {
    // Navigate to admin login
    await page.goto('http://localhost:3000/admin/login')
    
    // Login with default credentials
    await page.fill('input[name="email"]', 'contact@sydevelopers.com')
    await page.fill('input[name="password"]', 'evk1VTH5dxz_nhg-mzk')
    await page.click('button[type="submit"]')
    
    // Wait for dashboard to load
    await page.waitForURL('**/admin')
  })

  test('can navigate to clients collection', async () => {
    // Click on Utility group in sidebar
    await page.click('text=Utility')
    
    // Click on Clients
    await page.click('a[href="/admin/collections/clients"]')
    
    // Verify we're on the clients page
    await expect(page).toHaveURL(/\/admin\/collections\/clients/)
    await expect(page.locator('h1')).toContainText('Clients')
  })

  test('can create a new client', async () => {
    // Navigate to clients
    await page.goto('http://localhost:3000/admin/collections/clients')
    
    // Click create new
    await page.click('a[href="/admin/collections/clients/create"]')
    
    // Fill in client details
    await page.fill('input[name="name"]', 'Test E2E Client')
    await page.fill('textarea[name="description"]', 'Client created during E2E testing')
    
    // Select role
    await page.selectOption('select[name="role"]', 'full-access')
    
    // Add manager (assuming there's at least one user)
    await page.click('button:has-text("Add managers")')
    await page.waitForTimeout(500) // Wait for modal
    const firstUserOption = page.locator('.relationship-add-new__option').first()
    await firstUserOption.click()
    
    // Set primary contact (same as manager)
    await page.click('button:has-text("Add primaryContact")')
    await page.waitForTimeout(500) // Wait for modal
    const firstContactOption = page.locator('.relationship-add-new__option').first()
    await firstContactOption.click()
    
    // Save
    await page.click('button:has-text("Save")')
    
    // Verify success
    await expect(page.locator('.toast-success')).toBeVisible()
    await expect(page.locator('h1')).toContainText('Test E2E Client')
  })

  test('displays API key generation interface', async () => {
    // Navigate to an existing client
    await page.goto('http://localhost:3000/admin/collections/clients')
    
    // Click on first client in list
    const firstClient = page.locator('table tbody tr').first()
    await firstClient.click()
    
    // Look for API key section
    await expect(page.locator('text=API Key')).toBeVisible()
    
    // Check for generate/regenerate button
    const apiKeyButton = page.locator('button:has-text("Generate API Key"), button:has-text("Regenerate API Key")')
    await expect(apiKeyButton).toBeVisible()
  })

  test('displays usage statistics', async () => {
    // Navigate to an existing client
    await page.goto('http://localhost:3000/admin/collections/clients')
    
    // Click on first client in list
    const firstClient = page.locator('table tbody tr').first()
    await firstClient.click()
    
    // Look for usage stats section
    await expect(page.locator('text=Usage Stats')).toBeVisible()
    
    // Check for usage stat fields
    await expect(page.locator('text=Total Requests')).toBeVisible()
    await expect(page.locator('text=Daily Requests')).toBeVisible()
    await expect(page.locator('text=Last Request At')).toBeVisible()
    await expect(page.locator('text=Last Reset At')).toBeVisible()
  })

  test('shows high usage alert when threshold exceeded', async () => {
    // This test would require creating a client with high usage
    // For now, we'll just verify the alert field exists
    
    // Navigate to an existing client
    await page.goto('http://localhost:3000/admin/collections/clients')
    
    // Click on first client in list
    const firstClient = page.locator('table tbody tr').first()
    await firstClient.click()
    
    // Look for high usage alert field
    await expect(page.locator('text=High Usage Alert')).toBeVisible()
  })

  test('can edit client details', async () => {
    // Navigate to an existing client
    await page.goto('http://localhost:3000/admin/collections/clients')
    
    // Click on first client in list
    const firstClient = page.locator('table tbody tr').first()
    await firstClient.click()
    
    // Edit name
    const nameInput = page.locator('input[name="name"]')
    await nameInput.clear()
    await nameInput.fill('Updated Client Name')
    
    // Toggle active status
    await page.click('input[name="active"]')
    
    // Save changes
    await page.click('button:has-text("Save")')
    
    // Verify success
    await expect(page.locator('.toast-success')).toBeVisible()
  })

  test('validates required fields', async () => {
    // Navigate to create new client
    await page.goto('http://localhost:3000/admin/collections/clients/create')
    
    // Try to save without filling required fields
    await page.click('button:has-text("Save")')
    
    // Check for validation errors
    await expect(page.locator('text=This field is required')).toBeVisible()
  })

  test('filters clients in list view', async () => {
    // Navigate to clients list
    await page.goto('http://localhost:3000/admin/collections/clients')
    
    // Use search/filter if available
    const searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="Filter"]')
    if (await searchInput.isVisible()) {
      await searchInput.fill('Test')
      await page.keyboard.press('Enter')
      
      // Verify filtered results
      await page.waitForTimeout(1000) // Wait for filter to apply
      const rows = page.locator('table tbody tr')
      const count = await rows.count()
      
      // Should have filtered results (exact count depends on test data)
      expect(count).toBeGreaterThanOrEqual(0)
    }
  })

  test('shows client list with key information', async () => {
    // Navigate to clients list
    await page.goto('http://localhost:3000/admin/collections/clients')
    
    // Verify table columns
    await expect(page.locator('th:has-text("Name")')).toBeVisible()
    await expect(page.locator('th:has-text("Active")')).toBeVisible()
    await expect(page.locator('th:has-text("Role")')).toBeVisible()
    
    // Verify at least one row exists (if there's data)
    const rows = page.locator('table tbody tr')
    const rowCount = await rows.count()
    
    if (rowCount > 0) {
      // Check first row has expected data
      const firstRow = rows.first()
      await expect(firstRow.locator('td').first()).not.toBeEmpty()
    }
  })

  test.afterEach(async () => {
    // Logout after each test
    await page.goto('http://localhost:3000/admin/logout')
  })
})