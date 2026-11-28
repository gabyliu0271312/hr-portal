/* REA 抓取 11：项目设置「…」下拉
 */
process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'out', 'role-add-dialog');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('feishu.cn'));
  if (!page) throw new Error('no feishu page');
  const loc = await page.evaluate(() => {
    const divs = [...document.querySelectorAll('div.sc-EhVdV')];
    const d = divs.find(el => { const r = el.getBoundingClientRect(); return r.width === 24 && r.y >= 490 && r.y <= 530 && getComputedStyle(el).cursor === 'pointer'; });
    if (!d) return null;
    const r = d.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  log('MORE_LOC', JSON.stringify(loc));
  if (!loc) throw new Error('no more btn');
  await page.mouse.move(loc.x, loc.y);
  await page.waitForTimeout(1600);
  const dd = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.perf-web__ud__menu-normal-item')];
    return items.map(el => ({ t: (el.textContent || '').trim().slice(0, 14), cls: (el.className || '').toString().slice(0, 50), x: +el.getBoundingClientRect().x.toFixed(0), y: +el.getBoundingClientRect().y.toFixed(0), w: +el.getBoundingClientRect().width.toFixed(0), h: +el.getBoundingClientRect().height.toFixed(0) }));
  });
  fs.writeFileSync(path.join(OUT, '34-proj-more-dropdown.json'), JSON.stringify(dd, null, 2), 'utf8');
  try { await page.screenshot({ path: path.join(OUT, '35-proj-more-dropdown.png'), timeout: 10000 }); log('SHOT ok'); } catch (e) { log('SHOT fail', e.message.slice(0, 50)); }
  log('ITEMS', JSON.stringify(dd));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
