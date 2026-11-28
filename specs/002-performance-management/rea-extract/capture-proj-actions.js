/* REA 抓取 10：项目设置行操作列完整 DOM + 「…」下拉（复制/删除?）
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

  // 项目设置区操作列（x 3000-3440, y 470-560）所有元素
  const area = await page.evaluate(() => {
    const out = [];
    [...document.querySelectorAll('*')].forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      if (r.x >= 2990 && r.y >= 470 && r.y <= 560) {
        const cs = getComputedStyle(el);
        const svgs = [...el.querySelectorAll('svg')].map(s => { const sr = s.getBoundingClientRect(); return { w: sr.width, h: sr.height, path: s.innerHTML.slice(0, 60) }; });
        out.push({ tag: el.tagName.toLowerCase(), cls: (el.className && el.className.toString ? el.className.toString().slice(0, 70) : ''), t: (el.textContent || '').trim().slice(0, 10), x: +r.x.toFixed(0), y: +r.y.toFixed(0), w: +r.width.toFixed(0), h: +r.height.toFixed(0), cursor: cs.cursor, svgs });
      }
    });
    return out;
  });
  fs.writeFileSync(path.join(OUT, '33-proj-action-column.json'), JSON.stringify(area, null, 2), 'utf8');
  log('COUNT', area.length);
  area.slice(0, 25).forEach(a => console.log(a.tag, a.cls.split(' ').slice(0, 4).join('.'), JSON.stringify({ x: a.x, y: a.y, w: a.w, h: a.h }), 'cursor=' + a.cursor, 't=' + a.t, 'svg=' + (a.svgs && a.svgs.length ? a.svgs.map(s => s.w + 'x' + s.h + ':' + s.path).join('|') : '')));

  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
