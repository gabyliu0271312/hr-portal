/* 360°评估率 tooltip 提炼 - 10: 诊断分页器 + 表格底部区域
 * 用法：node capture-rate-tooltip-10-pagination.js
 * 产出：out/rate-tooltip/10-pagination.json
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
      apiReq.push({ m: req.method(), u: u.slice(0, 240), pd: (req.postData() || '').slice(0, 2500) });
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

  // 表格底部区域（y>1300）：分页器
  const bottom = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    // 找含"上一页/下一页/共X页/条/页"的容器
    const cands = [...document.querySelectorAll('div,button,ul,li,span')].filter(el => {
      const rr = el.getBoundingClientRect();
      const t = (el.textContent || '').trim();
      return rr.width > 0 && rr.height > 10 && rr.y > 1250 && rr.y < 1450 && (t.length < 60);
    }).map(el => ({ tag: el.tagName, t: (el.textContent || '').trim().slice(0, 40), ...rect(el), cls: (el.className || '').toString().slice(0, 70), role: el.getAttribute('role') || '' }));
    return cands;
  });
  fs.writeFileSync(path.join(OUT, '10-pagination.json'), JSON.stringify(bottom, null, 1), 'utf8');
  log('BOTTOM_ELS', bottom.length);
  bottom.forEach(b => log('  BT', b.tag, b.t, b.x, b.y, b.w, b.h, b.cls.slice(0, 40)));
  await page.screenshot({ path: path.join(OUT, '10-bottom.png') });
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
