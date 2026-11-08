process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 950 } });
  await page.goto('http://localhost:5173/verify-configured.html', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
  const out = await page.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), w: +b.width.toFixed(1) }; };
    // root 标题（卡片 header 内 preview-header 名称）
    const card = document.querySelector('.configured-content-card');
    const rootTitle = document.querySelector('.configured-content-card__row .performance-assessment-preview-header, .configured-content-card__row [class*=preview-header] h1, .configured-content-card__row [class*=preview-header] h2, .configured-content-card__row [class*=preview-header] strong');
    const details = document.querySelector('.configured-content-card__details');
    const itemTitle = details ? details.querySelector('.performance-item-title, [class*=item-title], .content-renderer-item strong, [class*=field] label, [class*=item] strong') : null;
    return {
      card: card ? r(card) : null,
      rootTitle: rootTitle ? r(rootTitle) : null,
      details: details ? r(details) : null,
      itemTitle: itemTitle ? r(itemTitle) : null,
    };
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
