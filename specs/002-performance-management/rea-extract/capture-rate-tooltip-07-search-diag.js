/* 360°评估率 tooltip 提炼 - 07: 诊断搜索框 + 表格滚动加载下一页
 * 用法：node capture-rate-tooltip-07-search-diag.js
 * 产出：out/rate-tooltip/07-diag.json
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
    if (u.includes('/perf/api/report/v3/semesters/') && !/\.(js|css|png|svg|woff|ico)/.test(u)) {
      apiReq.push({ m: req.method(), u: u.slice(0, 260), pd: (req.postData() || '').slice(0, 3000) });
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

  // 1) 找工具栏搜索框：y 175-205, x<600, 含 input 或可点击聚焦
  const search = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    // 工具栏区域所有元素
    const els = [...document.querySelectorAll('input,div,button,span')].filter(el => { const rr = el.getBoundingClientRect(); return rr.x >= 280 && rr.x < 1200 && rr.y >= 175 && rr.y <= 210 && rr.width > 0 && rr.height > 10; })
      .map(el => ({ tag: el.tagName, ...rect(el), cls: (el.className || '').toString().slice(0, 80), ph: el.placeholder || '', role: el.getAttribute('role') || '', aria: el.getAttribute('aria-label') || '', t: (el.textContent || '').trim().slice(0, 20), cs_pos: getComputedStyle(el).position, cs_vis: getComputedStyle(el).visibility, cs_disp: getComputedStyle(el).display }));
    return els.sort((a, b) => a.x - b.x);
  });
  fs.writeFileSync(path.join(OUT, '07-search-area.json'), JSON.stringify(search, null, 1), 'utf8');
  log('SEARCH_AREA_ELS', search.length);
  search.forEach(s => log('  SE', s.tag, s.x, s.y, s.w, s.h, s.cls.slice(0, 40), s.ph, s.role, s.cs_disp));

  // 2) 尝试点击 搜索图标右侧区域，看是否聚焦 input
  await page.mouse.click(340, 200);
  await page.waitForTimeout(600);
  const afterClick = await page.evaluate(() => {
    const act = document.activeElement;
    const rr = act.getBoundingClientRect();
    return { tag: act.tagName, cls: (act.className || '').toString().slice(0, 80), ph: act.placeholder || '', role: act.getAttribute('role') || '', x: +rr.x.toFixed(1), y: +rr.y.toFixed(1), w: +rr.width.toFixed(1), h: +rr.height.toFixed(1) };
  });
  log('ACTIVE_ELEMENT', JSON.stringify(afterClick));

  // 3) 输入 朱鹏旭
  await page.keyboard.type('朱鹏旭', { delay: 50 });
  await page.waitForTimeout(2000);
  const hasRow = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('tr,[class*=table-row],[class*=Row]')].filter(r => r.getBoundingClientRect().height > 30);
    return { total: rows.length, matches: rows.filter(r => (r.textContent || '').includes('朱鹏旭')).map(r => ({ text: (r.textContent || '').slice(0, 80), y: +r.getBoundingClientRect().y.toFixed(0) })), bodyText: document.body.innerText.includes('朱鹏旭') };
  });
  log('AFTER_TYPE', JSON.stringify(hasRow));

  // 4) 尝试滚动表格找滚动容器
  const scrollInfo = await page.evaluate(() => {
    const info = [];
    for (const el of document.querySelectorAll('*')) {
      const c = getComputedStyle(el);
      if (el.scrollHeight > el.clientHeight + 30 && ['auto', 'scroll'].includes(c.overflowY)) {
        const rr = el.getBoundingClientRect();
        info.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 60), ...(n => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; })(), sh: el.scrollHeight, ch: el.clientHeight, st: el.scrollTop });
      }
    }
    return info;
  });
  log('SCROLLERS', scrollInfo.length);
  scrollInfo.forEach(s => log('  SC', s.tag, s.cls.slice(0, 40), s.x, s.y, s.w, s.h, 'sh', s.sh, 'ch', s.ch, 'st', s.st));

  fs.writeFileSync(path.join(OUT, '07-scroll.json'), JSON.stringify(scrollInfo, null, 1), 'utf8');
  log('---REQ---');
  apiReq.forEach(r => log('  ', r.m, r.u.replace('https://idreamsky.feishu.cn', ''), (r.pd || '').slice(0, 200)));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
