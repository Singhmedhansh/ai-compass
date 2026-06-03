import { test, expect } from '@playwright/test'

test.describe('First-Time User Verification and Onboarding Funnel E2E Test', () => {
  test('Cookie Consent, Wizard, Registration, and Verification Redirect Guard', async ({ page }) => {
    const consoleErrors = []
    
    // Capture console errors/warnings during the E2E session
    page.on('console', (msg) => {
      const text = msg.text()
      // Ignore network resource issues or third-party (Clerk) cross-origin blocks
      if (text.includes('net::ERR_') || text.includes('BLOCKED_BY_RESPONSE')) {
        return
      }
      if (msg.type() === 'error') {
        consoleErrors.push(`[CONSOLE ERROR] ${text}`)
      }
      if (text.includes('zeroResultsFallbackActive') || text.includes('ReferenceError') || text.includes('.map is not a function')) {
        consoleErrors.push(`[REGRESSION EXCEPTION] ${text}`)
      }
    })

    // STEP 1: Landing & Compliance (Cookie Consent Banner)
    console.log('STEP 1: Navigating to homepage...')
    await page.goto('/')
    await page.waitForTimeout(1000) // Allow delayed cookie banner mount

    // Verify Cookie Consent Banner appears and click Decline
    const declineBtn = page.getByRole('button', { name: 'Decline' })
    await expect(declineBtn).toBeVisible()
    console.log('Declining cookie banner...')
    await declineBtn.click()
    await expect(declineBtn).not.toBeVisible()

    // STEP 2: The Onboarding Wizard
    console.log('STEP 2: Navigating to Wizard...')
    await page.goto('/ai-tool-finder')
    
    // Assert value proposition banner renders on initialization
    const valuePropText = page.getByText(/Find your ideal student AI stack in under 60 seconds/i)
    await expect(valuePropText).toBeVisible()
    console.log('Value proposition banner is visible.')

    // Click Begin wizard
    await page.getByRole('button', { name: /Begin wizard/i }).click()
    await page.waitForTimeout(300)

    // Q1 Goal: Click Coding
    console.log('Selecting Goal: Coding...')
    await page.getByRole('button', { name: 'Coding', exact: true }).click()
    await page.waitForTimeout(300)
    // Click Continue for multi-select
    await page.getByRole('button', { name: 'Continue →' }).click()
    await page.waitForTimeout(400)

    // Q2 Specifics: Verify grid renders and click "Other options..." progressive disclosure
    console.log('Testing sub-category grid and progressive disclosure...')
    const otherOptionsBtn = page.getByRole('button', { name: 'Other options...' })
    await expect(otherOptionsBtn).toBeVisible()
    await otherOptionsBtn.click()
    await page.waitForTimeout(300)

    // We can see the expanded custom field or hidden options
    const customLabel = page.getByText('Or specify your own custom specifics:')
    await expect(customLabel).toBeVisible()

    // Choose a primary sub-category option: "Build a web app"
    const subCategoryCard = page.getByText('Build a web app').first()
    await expect(subCategoryCard).toBeVisible()
    await subCategoryCard.click()
    await page.waitForTimeout(300)

    // Click Continue
    await page.getByRole('button', { name: 'Continue →' }).click()
    await page.waitForTimeout(400)

    // Q3 Budget: Click "Free only"
    console.log('Selecting Budget: Free only...')
    const freeBtn = page.getByRole('button', { name: 'Free only', exact: true }).first()
    await freeBtn.click()
    await page.waitForTimeout(400)

    // Q4 Platform: Click "Web browser"
    console.log('Selecting Platform: Web browser...')
    const webBrowserBtn = page.getByRole('button', { name: 'Web browser', exact: true }).first()
    await webBrowserBtn.click()
    await page.waitForTimeout(300)
    // Click Continue for multi-select platform
    await page.getByRole('button', { name: 'Continue →' }).click()
    await page.waitForTimeout(400)

    // Q5 Level: Click "Beginner"
    console.log('Selecting Level: Beginner...')
    const beginnerBtn = page.getByRole('button', { name: 'Beginner', exact: true }).first()
    await beginnerBtn.click()
    await page.waitForTimeout(800)

    // Click "See full results" to finish the wizard
    const seeResults = page.getByRole('button', { name: /See full results/i }).first()
    if (await seeResults.count() > 0) {
      await seeResults.click()
      await page.waitForTimeout(800)
    }

    // STEP 3: Account Registration
    console.log('STEP 3: Registering new user account...')
    await page.goto('/register')
    await page.waitForTimeout(400)

    const randomId = Math.floor(Math.random() * 1000000)
    const testEmail = `e2e_student_${randomId}@aicompass.test`
    const testPassword = 'Password123'

    await page.locator('#register-name').fill('E2E Test Student')
    await page.locator('#register-email').fill(testEmail)
    await page.locator('#register-password').fill(testPassword)
    await page.locator('#register-confirm-password').fill(testPassword)
    
    await page.getByRole('button', { name: 'Create account' }).click()
    
    // Verify it transitions to Login page
    await page.waitForURL('**/login')
    console.log(`Registration successful. Registered email: ${testEmail}`)

    // STEP 4: Verification Gate Interception & Redirection
    console.log('STEP 4: Logging in and verifying redirect interceptor...')
    await page.locator('#login-email').fill(testEmail)
    await page.locator('#login-password').fill(testPassword)
    await page.getByRole('button', { name: 'Sign In' }).click()

    // It should log in, but instead of showing /dashboard, route guard must immediately intercept and redirect to /verify-email-pending
    await page.waitForURL('**/verify-email-pending')
    
    // Verify that Pending Verification title and user email are visible on page
    await expect(page.getByText('Verify Your Email')).toBeVisible()
    await expect(page.getByText(testEmail)).toBeVisible()
    console.log('Successfully intercepted route! Redirection to /verify-email-pending confirmed.')

    // Verify no unhandled errors recorded in console
    console.log('Verifying telemetry/console regressions...')
    expect(consoleErrors).toHaveLength(0)
    console.log('Zero funnel or unhandled variable console errors detected!')
  })
})
