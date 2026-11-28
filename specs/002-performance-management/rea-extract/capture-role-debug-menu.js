process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('feishu.cn'));
  if (!page) { console.log('NO_PAGE'); return; }
  const loc = await page.evaluate(() => {
    const div = [...document.querySelectorAll('div')].find(el => {
      const r = el.getBoundingClientRect();
      return r.width === 24 && r.height === 24 && r.y >= 330 && r.y <= 380 && getComputedStyle(el).cursor === 'pointer';
    });
    if (!div) return null;
    const r = div.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  console.log('MORE_LOC', JSON.stringify(loc));
  await page.mouse.move(loc.x, loc.y);
  await page.waitForTimeout(1300);
  const dump = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.perf-web__ud__menu-normal-item')];
    return items.map(el => ({ cls: (el.className || '').toString().slice(0, 60), t: JSON.stringify((el.textContent || '').trim()), hasChildren: el.children.length, outer: el.outerHTML.slice(0, 200) }));
  });
  console.log('ITEMS', JSON.stringify(dump, null, 1));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
