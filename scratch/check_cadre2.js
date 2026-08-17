const { chromium } = require('../frontend/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage();

  for (const path of ['/', '/privacy', '/terms', '/legal', '/contact', '/about']) {
    try {
      const resp = await page.goto(`https://cadre.rocks${path}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1000);
      const bodyText = await page.textContent('body');
      const emailMatches = [...new Set([...bodyText.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)].map(m => m[0]))]
        .filter(e => !e.includes('acme.com'));
      console.log(`--- ${path} (status ${resp.status()}) ---`);
      console.log('emails:', JSON.stringify(emailMatches));
      console.log('title:', await page.title());
    } catch (e) {
      console.log(`--- ${path} failed: ${e.message} ---`);
    }
  }

  await browser.close();
})();
