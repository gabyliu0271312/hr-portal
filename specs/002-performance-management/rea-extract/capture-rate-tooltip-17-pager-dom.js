/* 360°评估率 tooltip 提炼 - 17: 完整抓取分页器 DOM + 逐项点击测试
 * 用法：node capture-rate-tooltip-17-pager-dom.js
 * 产出：out/rate-tooltip/17-pager-dom.json
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

  // 滚动到分页器
  await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
  await page.waitForTimeout(800);

  // 抓分页器完整 DOM 树
  const pager = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const ul = document.querySelector('.ud__pagination');
    if (!ul) return { err: 'no pagination' };
    const dump = (el, depth) => {
      if (depth > 4) return null;
      const rr = el.getBoundingClientRect();
      return { tag: el.tagName, cls: (el.className || '').toString().slice(0, 80), ...rect(el), text: (el.textContent || '').trim().slice(0, 30), role: el.getAttribute('role') || '', aria: el.getAttribute('aria-label') || '', children: [...el.children].map(c => dump(c, depth + 1)).filter(Boolean) };
    };
    return { tree: dump(ul, 0) };
  });
  fs.writeFileSync(path.join(OUT, '17-pager-dom.json'), JSON.stringify(pager, null, 1), 'utf8');
  log('PAGER_TREE', JSON.stringify(pager.tree, null, 1).slice(0, 4000));

  // 测试点击所有可点元素，看哪个触发请求
  const clickable = await page.evaluate(() => {
    const ul = document.querySelector('.ud__pagination');
    if (!ul) return [];
    return [...ul.querySelectorAll('li,button,a,span')].filter(el => el.getBoundingClientRect().width > 0 && (el.getBoundingClientRect().width < 60)).map(el => ({ t: (el.textContent || '').trim().slice(0, 10), x: +el.getBoundingClientRect().x.toFixed(0), y: +el.getBoundingClientRect().y.toFixed(0), cls: (el.className || '').toString().slice(0, 50) }));
  });
  log('CLICKABLE', JSON.stringify(clickable));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
