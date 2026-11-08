/* 360°评估率 tooltip 提炼 - 15: 页面底部滚动 + 全页文本扫描找分页/加载更多
 * 用法：node capture-rate-tooltip-15-scan.js
 * 产出：out/rate-tooltip/15-scan.json
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

  // 页面级滚动到最底部（window scroll）观察是否触发
  await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
  await page.waitForTimeout(2500);
  // 全页文本扫描找关键分页/加载词
  const scan = await page.evaluate(() => {
    const words = ['上一页', '下一页', '加载更多', '共', '条', '页', '翻页', '更多', '到底了', '没有更多', '分页'];
    const hits = [...document.querySelectorAll('div,span,button,a,ul,li,p')].filter(el => {
      const rr = el.getBoundingClientRect();
      const t = (el.textContent || '').trim();
      return rr.width > 0 && rr.height > 0 && t && t.length < 60 && words.some(w => t.includes(w));
    }).map(el => ({ tag: el.tagName, t: (el.textContent || '').trim().slice(0, 40), cls: (el.className || '').toString().slice(0, 60), x: +el.getBoundingClientRect().x.toFixed(0), y: +el.getBoundingClientRect().y.toFixed(0) })).slice(0, 40);
    return hits;
  });
  log('WORD_HITS', scan.length);
  scan.forEach(s => log('  WH', s.tag, s.t, s.x, s.y, s.cls.slice(0, 40)));
  fs.writeFileSync(path.join(OUT, '15-scan.json'), JSON.stringify(scan, null, 1), 'utf8');
  await page.screenshot({ path: path.join(OUT, '15-bottom-full.png'), fullPage: false });

  // 页面 scrollHeight
  const dims = await page.evaluate(() => ({ sh: document.body.scrollHeight, iw: window.innerHeight, sw: window.scrollY, tableBottom: (() => { const el = document.querySelector('.simplebar-full-content'); return el ? el.getBoundingClientRect().height : 0; })() }));
  log('DIMS', JSON.stringify(dims));

  // 表格容器底部是否有分页条：直接抓 simplebar 内容最后 100px
  const tail = await page.evaluate(() => {
    const el = document.querySelector('.simplebar-full-content');
    if (!el) return [];
    const all = [...el.querySelectorAll('div,span,button,a,ul,li')].filter(c => c.getBoundingClientRect().width > 0 && (c.textContent || '').trim());
    return all.slice(-25).map(c => ({ t: (c.textContent || '').trim().slice(0, 40), cls: (c.className || '').toString().slice(0, 60), y: +c.getBoundingClientRect().y.toFixed(0), x: +c.getBoundingClientRect().x.toFixed(0) }));
  });
  log('TABLE_TAIL', tail.length);
  tail.forEach(t => log('  TT', t.t, t.x, t.y, t.cls.slice(0, 40)));

  log('---API---');
  apiReq.forEach(r => log('  ', r.u.replace('https://idreamsky.feishu.cn', ''), (r.pd || '').slice(0, 160)));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
