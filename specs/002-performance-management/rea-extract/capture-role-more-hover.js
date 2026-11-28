/* REA 抓取 6b：hover 「…」→ 采集下拉（复制/删除）
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

  // 找到第1行「…」div 坐标
  const loc = await page.evaluate(() => {
    const div = [...document.querySelectorAll('div')].find(el => {
      const r = el.getBoundingClientRect();
      return r.width === 24 && r.height === 24 && r.y >= 330 && r.y <= 380 && getComputedStyle(el).cursor === 'pointer';
    });
    if (!div) return null;
    const r = div.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  log('MORE_LOC', JSON.stringify(loc));
  if (!loc) throw new Error('no more btn');
  await page.mouse.move(loc.x, loc.y);
  await page.waitForTimeout(1200);

  // 采集下拉可见文本 + 容器
  const dd = await page.evaluate(() => {
    const texts = [...document.querySelectorAll('*')].filter(el => {
      const r = el.getBoundingClientRect();
      const t = (el.textContent || '').trim();
      return t && t.length < 20 && r.width > 0 && r.height > 0 && el.children.length === 0 && r.y > 300 && r.x > 2900;
    }).map(el => ({ t: (el.textContent || '').trim(), x: +el.getBoundingClientRect().x.toFixed(0), y: +el.getBoundingClientRect().y.toFixed(0), w: +el.getBoundingClientRect().width.toFixed(0) }));
    const containers = [...document.querySelectorAll('[class*=popover],[class*=dropdown],[class*=menu]')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.y > 300; }).map(el => ({ cls: (el.className || '').toString().slice(0, 80), x: +el.getBoundingClientRect().x.toFixed(0), y: +el.getBoundingClientRect().y.toFixed(0), w: +el.getBoundingClientRect().width.toFixed(0), h: +el.getBoundingClientRect().height.toFixed(0) }));
    return { texts, containers };
  });
  fs.writeFileSync(path.join(OUT, '25-more-dropdown.json'), JSON.stringify(dd, null, 2), 'utf8');
  await page.screenshot({ path: path.join(OUT, '26-more-dropdown.png') });
  log('TEXTS', JSON.stringify(dd.texts));
  log('CONTAINERS', JSON.stringify(dd.containers));

  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
