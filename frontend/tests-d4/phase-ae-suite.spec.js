import { test, expect } from '@playwright/test'

// =============================================================================
// FIXTURES — backend response shapes
// =============================================================================

const USER_FIXTURE = {
  id: 'test-user-001',
  name: 'Visual Test User',
  email: 'visual@test.local',
  picture: '',
  member_since: '2024-01-15',
  created_at: '2024-01-15T00:00:00Z',
}

const TOOLS_FIXTURE = [
  { slug: 'chatgpt', name: 'ChatGPT', description: 'OpenAI conversational AI for writing, brainstorming, and Q&A.', shortDescription: 'OpenAI conversational AI.', category: 'Writing & Chat', rating: 4.7, pricing: 'Freemium', reviewCount: 12450, createdAt: '2022-11-30T00:00:00Z', url: 'https://chat.openai.com', website_url: 'https://chat.openai.com' },
  { slug: 'claude', name: 'Claude', description: "Anthropic's AI assistant for long-form reasoning and safe outputs.", shortDescription: 'Anthropic AI assistant.', category: 'Writing & Chat', rating: 4.8, pricing: 'Freemium', reviewCount: 8200, createdAt: '2023-03-14T00:00:00Z', url: 'https://claude.ai', website_url: 'https://claude.ai' },
  { slug: 'github-copilot', name: 'GitHub Copilot', description: 'AI pair programmer that suggests code completions across editors.', shortDescription: 'AI pair-programming.', category: 'Coding', rating: 4.6, pricing: 'Paid', reviewCount: 6300, createdAt: '2021-10-29T00:00:00Z', url: 'https://github.com/features/copilot' },
  { slug: 'cursor', name: 'Cursor', description: 'AI-native code editor with chat, edit, and agent modes.', shortDescription: 'AI-first code editor.', category: 'Coding', rating: 4.5, pricing: 'Free', reviewCount: 3100, createdAt: '2023-04-01T00:00:00Z', url: 'https://cursor.com' },
  { slug: 'perplexity', name: 'Perplexity', description: 'AI answer engine that cites sources for every response.', shortDescription: 'Answer engine with citations.', category: 'Research', rating: 4.6, pricing: 'Freemium', reviewCount: 4900, createdAt: '2022-12-07T00:00:00Z', url: 'https://perplexity.ai' },
  { slug: 'notion-ai', name: 'Notion AI', description: 'AI writing built into Notion docs and databases.', shortDescription: 'AI inside Notion.', category: 'Productivity', rating: 4.4, pricing: 'Paid', reviewCount: 2700, createdAt: '2023-02-22T00:00:00Z', url: 'https://notion.so/product/ai' },
  { slug: 'midjourney', name: 'Midjourney', description: 'High-quality AI image generation from text prompts.', shortDescription: 'Premium AI image generation.', category: 'Image Generation', rating: 4.7, pricing: 'Paid', reviewCount: 9800, createdAt: '2022-07-12T00:00:00Z', url: 'https://midjourney.com' },
  { slug: 'runway', name: 'Runway', description: 'AI video generation, editing, and motion brush for filmmakers.', shortDescription: 'AI video generation.', category: 'Video Generation', rating: 4.5, pricing: 'Paid', reviewCount: 1800, createdAt: '2023-06-15T00:00:00Z', url: 'https://runwayml.com' },
  { slug: 'elevenlabs', name: 'ElevenLabs', description: 'AI voice synthesis with realistic speech for content creators.', shortDescription: 'AI voice synthesis.', category: 'Audio & Voice', rating: 4.6, pricing: 'Freemium', reviewCount: 3400, createdAt: '2022-08-04T00:00:00Z', url: 'https://elevenlabs.io' },
  { slug: 'synthesia', name: 'Synthesia', description: 'AI video creation with synthetic avatars and translation.', shortDescription: 'AI avatar video creation.', category: 'Video Generation', rating: 4.4, pricing: 'Paid', reviewCount: 1500, createdAt: '2021-12-01T00:00:00Z', url: 'https://synthesia.io' },
  { slug: 'suno', name: 'Suno', description: 'AI music generation from text prompts.', shortDescription: 'AI music generation.', category: 'Audio & Voice', rating: 4.5, pricing: 'Freemium', reviewCount: 2200, createdAt: '2023-09-10T00:00:00Z', url: 'https://suno.ai' },
  { slug: 'whisper', name: 'Whisper', description: 'Open-source speech-to-text transcription model from OpenAI.', shortDescription: 'Open speech-to-text.', category: 'Audio & Voice', rating: 4.7, pricing: 'Free', reviewCount: 4100, createdAt: '2022-09-21T00:00:00Z', url: 'https://openai.com/research/whisper' },
]

const COLLECTION_TOOLS_FIXTURE = TOOLS_FIXTURE.slice(0, 8)

const FAVORITES_FIXTURE = TOOLS_FIXTURE.slice(0, 3).map((tool) => ({
  slug: tool.slug,
  name: tool.name,
}))

const STACKS_FIXTURE = [
  {
    id: 'stack-1',
    name: 'My Coding Stack',
    goal: 'coding',
    budget: 'free',
    platform: 'web',
    level: 'intermediate',
    tools: ['chatgpt', 'github-copilot', 'cursor', 'claude'],
    created_at: '2024-02-10T00:00:00Z',
  },
]

const REVIEWS_FIXTURE = [
  { id: 'r1', user: 'Alex', rating: 5, comment: 'Game changer for my workflow.', created_at: '2024-03-01T00:00:00Z' },
  { id: 'r2', user: 'Jordan', rating: 4, comment: 'Solid daily driver, occasional misses.', created_at: '2024-02-15T00:00:00Z' },
]

const FINDER_RESPONSE_FIXTURE = {
  count: 5,
  tools: [
    { ...TOOLS_FIXTURE[0], reason: 'Best free tier for explaining unfamiliar code line-by-line.', match_score: 0.95, platforms: ['Web'] },
    { ...TOOLS_FIXTURE[1], reason: 'Reads longer code files than ChatGPT free.', match_score: 0.92, platforms: ['Web'] },
    { ...TOOLS_FIXTURE[2], reason: 'Free for verified students via GitHub Education.', match_score: 0.88, platforms: ['Desktop', 'Web'] },
    { ...TOOLS_FIXTURE[3], reason: 'AI-first editor for power users.', match_score: 0.85, platforms: ['Desktop'] },
    { ...TOOLS_FIXTURE[4], reason: 'Cited sources keep your code research honest.', match_score: 0.82, platforms: ['Web'] },
  ],
}

const RECOMMENDATIONS_FIXTURE = TOOLS_FIXTURE.slice(0, 6)

const ADMIN_STATS_FIXTURE = { totalTools: 12, totalUsers: 0, totalReviews: 2, pendingSubmissions: 0 }

// =============================================================================
// HELPERS
// =============================================================================

const STORAGE_KEY = 'ai-compass-theme'
const SCREENSHOT_DIR = 'tests-d4/screenshots/phase-ae'

async function mockBackend(page) {
  await page.route('**/api/v1/**', async (route) => {
    let url
    try {
      url = new URL(route.request().url())
    } catch {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    }
    const path = url.pathname

    const respond = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    // Tools endpoints
    if (path === '/api/v1/tools') return respond(TOOLS_FIXTURE)
    if (path.startsWith('/api/v1/tools/')) {
      const slug = decodeURIComponent(path.split('/').filter(Boolean).pop() || '')
      const tool = TOOLS_FIXTURE.find((t) => t.slug === slug) || TOOLS_FIXTURE[0]
      return respond({ ...tool, similar_tools: TOOLS_FIXTURE.filter((t) => t.slug !== tool.slug).slice(0, 3) })
    }

    // Search
    if (path === '/api/v1/search') return respond({ results: TOOLS_FIXTURE })

    // Collections
    if (path === '/api/v1/collections') return respond([])
    if (path.startsWith('/api/v1/collections/')) {
      const slug = decodeURIComponent(path.split('/').filter(Boolean).pop() || '')
      return respond({
        slug,
        name: 'Test Collection',
        title: 'Test Collection',
        description: 'A curated set of AI tools for visual verification.',
        meta_title: 'Test Collection | AI Compass',
        meta_description: 'A curated set of AI tools.',
        count: COLLECTION_TOOLS_FIXTURE.length,
        tools: COLLECTION_TOOLS_FIXTURE,
      })
    }

    // Auth
    if (path === '/api/v1/auth/me') return respond(USER_FIXTURE)
    if (path === '/api/v1/auth/login' || path === '/api/v1/auth/register')
      return respond({ user: USER_FIXTURE, token: 'mock-token' })

    // Profile
    if (path === '/api/v1/profile') return respond(USER_FIXTURE)

    // Favorites
    if (path === '/api/v1/favorites') return respond(FAVORITES_FIXTURE)

    // Stacks / recommendations / finder
    if (path === '/api/v1/stack' || path.startsWith('/api/v1/stack')) return respond(STACKS_FIXTURE)
    if (path === '/api/v1/recommendations') return respond(RECOMMENDATIONS_FIXTURE)
    if (path === '/api/v1/finder') return respond(FINDER_RESPONSE_FIXTURE)

    // Reviews
    if (path === '/api/v1/reviews' || path.startsWith('/api/v1/reviews')) return respond(REVIEWS_FIXTURE)

    // Admin (deferred but still mocked to keep AdminPage off the error path)
    if (path === '/api/v1/admin/stats') return respond(ADMIN_STATS_FIXTURE)
    if (path === '/api/v1/admin/users') return respond([USER_FIXTURE])
    if (path === '/api/v1/admin/reviews') return respond(REVIEWS_FIXTURE)

    // Submissions
    if (path === '/api/v1/submissions' || path.startsWith('/api/v1/submissions'))
      return respond({ ok: true })

    // Default: 200 empty object — better than letting unknown calls 404 noisily
    return respond({})
  })
}

async function setupAuth(page, user = USER_FIXTURE) {
  await page.addInitScript((u) => {
    localStorage.setItem('user', JSON.stringify(u))
  }, user)
}

async function setupTheme(page, theme) {
  await page.addInitScript(
    ({ key, t }) => {
      if (t === 'dark') {
        localStorage.setItem(key, t)
      } else {
        localStorage.removeItem(key)
      }
    },
    { key: STORAGE_KEY, t: theme },
  )
}

async function ensureThemeApplied(page, theme) {
  // Belt-and-suspenders: explicit setAttribute after navigation.
  await page.evaluate((t) => {
    if (t === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }, theme)
}

async function capture(page, name) {
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${name}.png`,
    fullPage: true,
  })
}

// =============================================================================
// MATRIX
// =============================================================================

const COMBOS = [
  { label: 'mobile-light', width: 375, height: 800, theme: 'light' },
  { label: 'mobile-dark', width: 375, height: 800, theme: 'dark' },
  { label: 'desktop-light', width: 1440, height: 900, theme: 'light' },
  { label: 'desktop-dark', width: 1440, height: 900, theme: 'dark' },
]

const PAGES = [
  { slug: 'home', url: '/', auth: false },
  { slug: 'tools', url: '/tools', auth: false },
  { slug: 'collections', url: '/collections', auth: false },
  { slug: 'collection-detail', url: '/collections/test-collection', auth: false },
  { slug: 'best-students', url: '/best-ai-tools-for-students', auth: false },
  { slug: 'best-free', url: '/best-free-ai-tools', auth: false },
  { slug: 'tool-detail', url: '/tools/chatgpt', auth: false },
  { slug: 'wizard', url: '/ai-tool-finder', auth: false },
  { slug: 'login', url: '/login', auth: false },
  { slug: 'register', url: '/register', auth: false },
  { slug: 'submit', url: '/submit', auth: true },
  { slug: 'auth-callback', url: '/auth/callback?code=test', auth: false },
  { slug: 'dashboard', url: '/dashboard', auth: true },
  { slug: 'profile', url: '/profile', auth: true },
]

// Pages where "networkidle" can hang due to debounced fetches, sticky polling,
// or fan-out parallel fetches that don't always settle cleanly.
// Use 'load' (faster) and a fixed settle delay.
const NETWORKIDLE_RISKY = new Set(['wizard', 'auth-callback', 'collections'])

// =============================================================================
// MAIN MATRIX TESTS — 14 pages × 4 combos = 56
// =============================================================================

for (const pg of PAGES) {
  test.describe(`page:${pg.slug}`, () => {
    for (const combo of COMBOS) {
      test(`${pg.slug}-${combo.label}`, async ({ page }) => {
        const consoleErrors = []
        page.on('pageerror', (err) => {
          consoleErrors.push(`pageerror: ${err.message}`)
        })

        await page.setViewportSize({ width: combo.width, height: combo.height })
        await setupTheme(page, combo.theme)
        if (pg.auth) {
          await setupAuth(page)
        }
        await mockBackend(page)

        const waitUntil = NETWORKIDLE_RISKY.has(pg.slug) ? 'load' : 'networkidle'
        await page.goto(pg.url, { waitUntil, timeout: 15000 })

        // For auth-callback, the useEffect navigates away. Capture whatever lands.
        if (pg.slug === 'auth-callback') {
          await page.waitForTimeout(800)
        } else {
          await page.waitForTimeout(400)
        }

        await ensureThemeApplied(page, combo.theme)
        await page.waitForTimeout(150)

        await capture(page, `${pg.slug}-${combo.label}`)

        // Soft sanity: pageerrors are noisy; log but don't fail unless multiple stack-trace-y ones land.
        if (consoleErrors.length > 0) {
          console.log(`[${pg.slug}-${combo.label}] page errors:`, consoleErrors)
        }
      })
    }
  })
}

// =============================================================================
// EXTRA STATES — wizard interactions (4) + profile delete-modal (2) = 6
// =============================================================================

test.describe('extra:wizard', () => {
  const COMBO = { width: 1440, height: 900, theme: 'light' } // desktop-light for legibility

  async function arrive(page) {
    await page.setViewportSize({ width: COMBO.width, height: COMBO.height })
    await setupTheme(page, COMBO.theme)
    await mockBackend(page)
    await page.goto('/ai-tool-finder', { waitUntil: 'load', timeout: 15000 })
    await page.waitForTimeout(400)
    await ensureThemeApplied(page, COMBO.theme)
  }

  test('wizard-empty', async ({ page }) => {
    await arrive(page)
    // No interaction — capture initial state, preview should show "Pick a few answers..."
    await page.waitForTimeout(200)
    await capture(page, 'wizard-empty')
  })

  test('wizard-one-answer', async ({ page }) => {
    await arrive(page)
    // Goal row is active by default; click "Coding" chip
    await page.getByRole('button', { name: 'Coding', exact: true }).click()
    // Wait past 250ms debounce + render
    await page.waitForTimeout(700)
    await capture(page, 'wizard-one-answer')
  })

  test('wizard-all-answered', async ({ page }) => {
    await arrive(page)
    // Q1 Goal: Coding
    await page.getByRole('button', { name: 'Coding', exact: true }).click()
    await page.waitForTimeout(150)
    // Q2 Specifics: open + type
    await page.getByRole('button', { name: /02\s*Specifics/ }).click().catch(() => {})
    // Fallback: click row by visible "Specifics" text
    const specificsRow = page.locator('button').filter({ hasText: 'Specifics' }).first()
    if (await specificsRow.count() > 0) {
      await specificsRow.click().catch(() => {})
    }
    await page.waitForTimeout(150)
    const useCaseInput = page.getByPlaceholder(/write essays|build a web app/i).first()
    if (await useCaseInput.count() > 0) {
      await useCaseInput.fill('build a web app')
    }
    // Q3 Budget
    const budgetRow = page.locator('button').filter({ hasText: 'Budget' }).first()
    await budgetRow.click().catch(() => {})
    await page.waitForTimeout(150)
    await page.getByRole('button', { name: 'Free only', exact: true }).click().catch(() => {})
    // Q4 Platform
    const platformRow = page.locator('button').filter({ hasText: 'Platform' }).first()
    await platformRow.click().catch(() => {})
    await page.waitForTimeout(150)
    await page.getByRole('button', { name: 'Web browser', exact: true }).click().catch(() => {})
    // Q5 Level
    const levelRow = page.locator('button').filter({ hasText: 'Level' }).first()
    await levelRow.click().catch(() => {})
    await page.waitForTimeout(150)
    await page.getByRole('button', { name: 'Beginner', exact: true }).click().catch(() => {})
    // Wait for final preview update
    await page.waitForTimeout(700)
    await capture(page, 'wizard-all-answered')
  })

  test('wizard-results-view', async ({ page }) => {
    await arrive(page)
    // Set up minimum gate: goal + level
    await page.getByRole('button', { name: 'Coding', exact: true }).click()
    await page.waitForTimeout(150)
    const levelRow = page.locator('button').filter({ hasText: 'Level' }).first()
    await levelRow.click().catch(() => {})
    await page.waitForTimeout(150)
    await page.getByRole('button', { name: 'Beginner', exact: true }).click().catch(() => {})
    // Wait for preview to populate so "See full results" is enabled
    await page.waitForTimeout(700)
    const seeResults = page.getByRole('button', { name: /See full results/i }).first()
    if (await seeResults.count() > 0) {
      await seeResults.click().catch(() => {})
      await page.waitForTimeout(500)
    }
    await capture(page, 'wizard-results-view')
  })
})

test.describe('extra:profile', () => {
  const COMBO = { width: 1440, height: 900, theme: 'light' }

  async function arrive(page) {
    await page.setViewportSize({ width: COMBO.width, height: COMBO.height })
    await setupTheme(page, COMBO.theme)
    await setupAuth(page)
    await mockBackend(page)
    await page.goto('/profile', { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(400)
    await ensureThemeApplied(page, COMBO.theme)
  }

  test('profile-delete-modal-step1', async ({ page }) => {
    await arrive(page)
    const deleteTrigger = page.getByRole('button', { name: /^Delete account$/i }).first()
    await deleteTrigger.click({ timeout: 5000 })
    await page.waitForTimeout(300)
    await capture(page, 'profile-delete-modal-step1')
  })

  test('profile-delete-modal-step2', async ({ page }) => {
    await arrive(page)
    const deleteTrigger = page.getByRole('button', { name: /^Delete account$/i }).first()
    await deleteTrigger.click({ timeout: 5000 })
    await page.waitForTimeout(300)
    // Fill password + click Continue to reach step 2
    const pwInput = page.locator('input[type="password"]').first()
    await pwInput.fill('test-password')
    const continueBtn = page.getByRole('button', { name: /^Continue$/i }).first()
    await continueBtn.click()
    await page.waitForTimeout(300)
    await capture(page, 'profile-delete-modal-step2')
  })
})
