const { chromium } = require('../frontend/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage();
  await page.goto('https://cadre.rocks/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const mailtoLinks = await page.$$eval('a[href^="mailto:"]', els => els.map(e => e.getAttribute('href')));
  const allLinks = await page.$$eval('a', els => els.map(e => ({ href: e.getAttribute('href'), text: e.textContent.trim() })).filter(l => l.href));
  const bodyText = await page.textContent('body');
  const emailMatches = [...bodyText.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)].map(m => m[0]);

  console.log('MAILTO LINKS:', JSON.stringify(mailtoLinks));
  console.log('EMAIL TEXT MATCHES:', JSON.stringify([...new Set(emailMatches)]));
  console.log('SOCIAL/EXTERNAL LINKS:', JSON.stringify(allLinks.filter(l => /twitter|x\.com|github|linkedin|discord|contact/i.test(l.href || ''))));

  // Try footer specifically
  const footerText = await page.$eval('footer', el => el.textContent).catch(() => 'NO FOOTER FOUND');
  console.log('FOOTER TEXT:', footerText.slice(0, 1000));

  await browser.close();
})();
