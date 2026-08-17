const { chromium } = require('../frontend/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage();

  for (const url of [
    'https://www.min.io/contact-us',
    'https://www.min.io/legal/privacy-policy',
  ]) {
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);
      const bodyText = await page.textContent('body');
      const emailMatches = [...new Set([...bodyText.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)].map(m => m[0]))];
      const mailtoLinks = await page.$$eval('a[href^="mailto:"]', els => els.map(e => e.getAttribute('href')));
      console.log(`--- ${url} (status ${resp.status()}) ---`);
      console.log('emails:', JSON.stringify(emailMatches));
      console.log('mailto:', JSON.stringify(mailtoLinks));
    } catch (e) {
      console.log(`--- ${url} failed: ${e.message} ---`);
    }
  }

  await browser.close();
})();
