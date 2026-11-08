/* 360°评估率 tooltip 提炼 - 12: 筛选器 + 完整工具栏 DOM
 * 用法：node capture-rate-tooltip-12-filter.js
 * 产出：out/rate-tooltip/12-toolbar-full.json / 12-filter.json
 */
process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = 'https://idreamsky.feishu.cn/perf/management/v2/7654423719619710195/7340285661313974274/all-projects/members';
const OUT = path.join(__dirname, 'out', 'rate-tooltip');
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  let page = ctx.pages().find(p => p.url().includes('all-projects/members'));
  if (!page) page = ctx.pages().find(p => p.url().includes('feishu.cn'));

  const apiReq = [];
  page.on('request', req => {
    const u = req.url();
    if (u.includes('/perf/api/report/v3/semesters/') && /users\/list/.test(u)) {
      apiReq.push({ m: req.method(), u: u.slice(0, 240), pd: (req.postData() || '').slice(0, 3000) });
    }
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  let waited = 0;
  while (waited < 150) {
    const t = await page.evaluate(() => document.body.innerText || '');
    if (/成员列表|360°/.test(t) && t.length > 300) break;
    await page.waitForTimeout(3000); waited += 3;
  }
  await page.waitForTimeout(4000);
  log('LOADED');

  // 工具栏 y 175-235 全部元素
  const toolbar = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    return [...document.querySelectorAll('div,button,span,input')].filter(el => {
      const rr = el.getBoundingClientRect();
      const c = getComputedStyle(el);
      return rr.y >= 170 && rr.y <= 240 && rr.width > 0 && rr.height > 0 && c.display !== 'none' && rr.width < 3000;
    }).map(el => ({ tag: el.tagName, t: (el.textContent || '').trim().slice(0, 20), ...rect(el), cls: (el.className || '').toString().slice(0, 60), ph: el.placeholder || '', role: el.getAttribute('role') || '' }))
      .filter(x => x.t || x.ph || x.role || /search|select|input|button|filter|export|column/i.test(x.cls))
      .sort((a, b) => a.x - b.x);
  });
  fs.writeFileSync(path.join(OUT, '12-toolbar-full.json'), JSON.stringify(toolbar, null, 1), 'utf8');
  log('TOOLBAR_FULL', toolbar.length);
  toolbar.forEach(t => log('  TF', t.tag, t.t, t.x, t.y, t.w, t.h, t.cls.slice(0, 40)));

  // 点击筛选按钮 (x3220,y184)
  await page.mouse.click(3220, 184);
  await page.waitForTimeout(1500);
  const filterPanel = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    // 弹出的面板
    const panels = [...document.querySelectorAll('[class*=dropdown],[class*=popup],[class*=panel],[class*=content],[class*=menu],[class*=drawer],[class*=dialog],[class*=modal]')]
      .filter(el => { const rr = el.getBoundingClientRect(); const c = getComputedStyle(el); return rr.width > 150 && rr.width < 900 && rr.height > 80 && (c.position === 'absolute' || c.position === 'fixed'); })
      .slice(0, 8)
      .map(el => ({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 90), ...rect(el), text: (el.textContent || '').trim().slice(0, 300) }));
    return panels;
  });
  fs.writeFileSync(path.join(OUT, '12-filter.json'), JSON.stringify(filterPanel, null, 1), 'utf8');
  log('FILTER_PANELS', filterPanel.length);
  filterPanel.forEach(f => log('  FP', f.cls.slice(0, 50), f.x, f.y, f.w, f.h, 'text:', f.text.slice(0, 80)));
  await page.screenshot({ path: path.join(OUT, '12-filter.png') });

  fs.writeFileSync(path.join(OUT, '12-api.json'), JSON.stringify(apiReq, null, 1), 'utf8');
  log('---API---');
  apiReq.forEach(r => log('  ', r.u.replace('https://idreamsky.feishu.cn', ''), (r.pd || '').slice(0, 200)));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
