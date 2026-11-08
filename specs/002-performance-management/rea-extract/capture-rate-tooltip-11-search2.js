/* 360°评估率 tooltip 提炼 - 11: 全面诊断搜索框交互 + 表格底部
 * 用法：node capture-rate-tooltip-11-search2.js
 * 产出：out/rate-tooltip/11-search.json / 11-bottom.json
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
    if (u.includes('/perf/api/') && !/\.(js|css|png|svg|woff|ico)/.test(u)) {
      apiReq.push({ m: req.method(), u: u.slice(0, 260), pd: (req.postData() || '').slice(0, 2000) });
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

  // 1) 点击搜索框 (x336,y186)
  await page.mouse.click(336, 186);
  await page.waitForTimeout(600);
  // 输入 aaron.zhu
  await page.keyboard.type('aaron.zhu', { delay: 40 });
  await page.waitForTimeout(2500);
  // 抓下拉面板
  const dd = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const panels = [...document.querySelectorAll('[class*=dropdown],[class*=dropdown],[class*=option],[class*=popup],[class*=menu],[class*=listbox],[class*=select],[class*=virtual-list],[class*=virtualList],ul,li')]
      .filter(el => { const rr = el.getBoundingClientRect(); return rr.width > 100 && rr.height > 40 && rr.y > 200; })
      .slice(0, 12)
      .map(el => ({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 80), ...rect(el), text: (el.textContent || '').trim().slice(0, 150) }));
    return panels;
  });
  fs.writeFileSync(path.join(OUT, '11-dropdown.json'), JSON.stringify(dd, null, 1), 'utf8');
  log('DROPDOWN_PANELS', dd.length);
  dd.forEach(d => log('  DD', d.tag, d.cls.slice(0, 40), d.x, d.y, d.w, d.h, 'text:', d.text.slice(0, 60)));

  // 2) 表格底部
  await page.evaluate(() => { const el = [...document.querySelectorAll('.simplebar-full-content')].find(e => e.scrollHeight > e.clientHeight + 30); if (el) el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(1200);
  const bottom = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    // 视口底部区域所有元素（含分页）
    return [...document.querySelectorAll('div,button,ul,li,span,a')].filter(el => {
      const rr = el.getBoundingClientRect(); const t = (el.textContent || '').trim();
      return rr.width > 0 && rr.height > 10 && rr.y > 1300 && t.length < 40 && t;
    }).map(el => ({ tag: el.tagName, t: t.slice(0, 30), ...rect(el), cls: (el.className || '').toString().slice(0, 60) })).slice(0, 50);
  });
  fs.writeFileSync(path.join(OUT, '11-bottom.json'), JSON.stringify(bottom, null, 1), 'utf8');
  log('BOTTOM', bottom.length);
  bottom.forEach(b => log('  BT', b.tag, b.t, b.x, b.y, b.w, b.h, b.cls.slice(0, 40)));
  await page.screenshot({ path: path.join(OUT, '11-bottom.png') });

  log('---API---');
  apiReq.filter(a => /users\/list|search|search/.test(a.u)).forEach(r => log('  ', r.m, r.u.replace('https://idreamsky.feishu.cn', ''), (r.pd || '').slice(0, 150)));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
