/* 360°评估率 tooltip 提炼 - 08: 滚动虚拟列表加载更多行，直到目标人员出现在 DOM
 * 用法：node capture-rate-tooltip-08-scroll-load.js
 * 产出：out/rate-tooltip/08-loaded.json / 08-rows.json
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
    if (u.includes('/perf/api/report/v3/semesters/') && /users\/(list|count)/.test(u)) {
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

  // 逐步滚动 simplebar 容器
  async function scrollContainer(steps) {
    const st = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.simplebar-full-content')].find(e => e.scrollHeight > e.clientHeight + 30);
      return el ? { h: el.scrollHeight, c: el.clientHeight, t: el.scrollTop } : null;
    });
    log('SCROLL_STATE', JSON.stringify(st));
    if (!st) return false;
    // 用滚轮事件滚动
    await page.mouse.move(1600, 700);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(1200);
    return true;
  }

  // 检查目标是否出现在 DOM
  const found = async (name) => page.evaluate((name) => {
    const rows = [...document.querySelectorAll('tr,[class*=table-row],[class*=Row]')].filter(r => r.getBoundingClientRect().height > 30);
    const m = rows.find(r => (r.textContent || '').includes(name));
    return { inDom: !!m, total: rows.length, y: m ? +m.getBoundingClientRect().y.toFixed(0) : null };
  }, name);

  for (let i = 0; i < 8; i++) {
    const r = await found('朱鹏旭');
    log('STEP', i, 'aaron inDom', r.inDom, 'totalRows', r.total, 'y', r.y);
    if (r.inDom) break;
    const ok = await scrollContainer();
    if (!ok) break;
  }

  // 若仍未找到，多滚几轮
  for (let i = 0; i < 10; i++) {
    const r = await found('朱鹏旭');
    if (r.inDom) break;
    const st = await page.evaluate(() => { const el = [...document.querySelectorAll('.simplebar-full-content')].find(e => e.scrollHeight > e.clientHeight + 30); return el ? { t: el.scrollTop, c: el.clientHeight } : null; });
    await page.mouse.move(1600, 700);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(800);
    log('EXTRA', i, 'scrollTop', st && st.t, 'aaron?', (await found('朱鹏旭')).inDom);
  }

  const final = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('tr,[class*=table-row],[class*=Row]')].filter(r => r.getBoundingClientRect().height > 30);
    return rows.map(r => ({ t: (r.textContent || '').trim().slice(0, 80), y: +r.getBoundingClientRect().y.toFixed(0), h: +r.getBoundingClientRect().height.toFixed(0) }));
  });
  fs.writeFileSync(path.join(OUT, '08-rows.json'), JSON.stringify(final, null, 1), 'utf8');
  log('FINAL_ROWS', final.length);
  final.forEach((r, i) => { if (i % 5 === 0 || /朱鹏旭|陈慧祥/.test(r.t)) log('  R', i, r.t.slice(0, 40), r.y, r.h); });
  fs.writeFileSync(path.join(OUT, '08-api.json'), JSON.stringify(apiReq, null, 1), 'utf8');
  log('API_REQ', apiReq.length);
  apiReq.forEach(r => log('  ', r.u.replace('https://idreamsky.feishu.cn', ''), (r.pd || '').slice(0, 150)));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
