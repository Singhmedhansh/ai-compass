const { webkit, devices } = require('playwright');

(async () => {
  const urls = [
    'https://ai-compass-1.onrender.com/tools',
    'https://ai-compass-1.onrender.com/ai-tool-finder',
  ];

  for (const url of urls) {
    const browser = await webkit.launch();
    const context = await browser.newContext({ ...devices['iPhone SE'] });
    const page = await context.newPage();

    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

    const metrics = await page.evaluate(() => {
      const searchEl = document.querySelector('input[type="search"], input[type="text"]');
      const gridEl = document.querySelector('.tools-grid');
      const buttons = [...document.querySelectorAll('button, .btn, .btn-primary, .btn-secondary')];

      return {
        href: location.href,
        bodyTextLength: document.body ? document.body.innerText.length : 0,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        hasToolsGrid: !!gridEl,
        hasFiltersRow: !!document.querySelector('.filters-row'),
        hasSearch: !!searchEl,
        searchFontSize: searchEl ? getComputedStyle(searchEl).fontSize : null,
        minButtonHeight: buttons.length
          ? Math.min(...buttons.map((b) => parseFloat(getComputedStyle(b).height) || 0))
          : null,
        gridTemplateColumns: gridEl ? getComputedStyle(gridEl).gridTemplateColumns : null,
      };
    });

    console.log('URL', url);
    console.log('METRICS', JSON.stringify(metrics));
    console.log('ERRORS', JSON.stringify(errors.slice(0, 10)));

    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
