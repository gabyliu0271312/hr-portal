/* 360°评估率 tooltip 提炼 - 14: 滚动到表格容器底部抓分页器 + 搜索下拉候选
 * 用法：node capture-rate-tooltip-14-pager.js
 * 产出：out/rate-tooltip/14-pager.json
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

  // 注入 MutationObserver 抓搜索下拉
  await page.evaluate(() => {
    window.__slog = [];
    const obs = new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        const t = (n.textContent || '').trim();
        if (t && t.length < 200 && /aaron|朱鹏旭|陈慧祥|肖惠方|加载|搜索/.test(t)) {
          window.__slog.push({ cls: (n.className || '').toString().slice(0, 80), text: t.slice(0, 100), at: Date.now() });
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    window.__slogObs = obs;
  });

  // 滚动表格容器到底部
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.simplebar-full-content')].find(e => e.scrollHeight > e.clientHeight + 30);
    if (el) el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(2000);
  // 抓视口内所有文本元素（找分页器：上一页/下一页/共X/第X页）
  const view = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    return [...document.querySelectorAll('div,span,button,li,a,ul')].filter(el => {
      const rr = el.getBoundingClientRect();
      const t = (el.textContent || '').trim();
      if (rr.y < 100 || rr.y > 1300 || rr.width < 20 || rr.width > 900) return false;
      if (!t || t.length > 40) return false;
      return /页|上一|下一|共|条|第|\d+\s*\/|\/ ?\d+|\d+\.\.\.|»|«|»|«/.test(t);
    }).map(el => ({ tag: el.tagName, t: (el.textContent || '').trim().slice(0, 30), ...rect(el), cls: (el.className || '').toString().slice(0, 60), role: el.getAttribute('role') || '' })).slice(0, 60);
  });
  log('PAGER_CANDS', view.length);
  view.forEach(v => log('  PG', v.tag, v.t, v.x, v.y, v.w, v.h, v.cls.slice(0, 40)));
  fs.writeFileSync(path.join(OUT, '14-pager.json'), JSON.stringify(view, null, 1), 'utf8');
  await page.screenshot({ path: path.join(OUT, '14-bottom-scrolled.png') });

  // 搜索下拉测试：点搜索框，输入 aaron
  await page.mouse.click(500, 200);
  await page.waitForTimeout(500);
  await page.keyboard.type('aaron', { delay: 60 });
  await page.waitForTimeout(2500);
  const slog = await page.evaluate(() => window.__slog || []);
  log('SEARCH_LOG', slog.length);
  slog.forEach(s => log('  SL', s.cls.slice(0, 50), 'text:', s.text.slice(0, 60)));
  fs.writeFileSync(path.join(OUT, '14-search-log.json'), JSON.stringify(slog, null, 1), 'utf8');
  await page.screenshot({ path: path.join(OUT, '14-search-aaron.png') });

  log('---API---');
  apiReq.forEach(r => log('  ', r.u.replace('https://idreamsky.feishu.cn', ''), (r.pd || '').slice(0, 180)));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
