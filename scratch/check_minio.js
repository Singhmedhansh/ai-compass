const { chromium } = require('../frontend/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage();
  await page.goto('https://min.io/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  const links = await page.$$eval('a', els => els.map(e => ({ href: e.getAttribute('href'), text: e.textContent.trim() })).filter(l => l.href && /privacy|terms|contact|help|support/i.test(l.text + l.href)));
  console.log('LINKS:', JSON.stringify(links, null, 2));

  await browser.close();
})();
