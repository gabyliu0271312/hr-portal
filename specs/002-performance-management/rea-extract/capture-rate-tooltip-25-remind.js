/* 360°评估率 tooltip 提炼 - 25: 搜索页面所有"催办"文字出现位置
 * 用法：node capture-rate-tooltip-25-remind.js
 * 产出：out/rate-tooltip/25-remind.json
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

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  let waited = 0;
  while (waited < 150) {
    const t = await page.evaluate(() => document.body.innerText || '');
    if (/成员列表|360°/.test(t) && t.length > 300) break;
    await page.waitForTimeout(3000); waited += 3;
  }
  await page.waitForTimeout(4000);
  log('LOADED');

  const scan = await page.evaluate(() => {
    const hits = [...document.querySelectorAll('div,span,button,a,svg')].filter(el => {
      const rr = el.getBoundingClientRect();
      const t = (el.textContent || '').trim();
      return rr.width > 0 && rr.height > 0 && (t.includes('催办') || (el.tagName === 'svg' && el.outerHTML.length < 2000 && /remind|urge|clock|bell/i.test(el.outerHTML)));
    }).map(el => ({ tag: el.tagName, t: (el.textContent || '').trim().slice(0, 40), cls: (el.className || '').toString().slice(0, 60), x: +el.getBoundingClientRect().x.toFixed(0), y: +el.getBoundingClientRect().y.toFixed(0), w: +el.getBoundingClientRect().width.toFixed(0), h: +el.getBoundingClientRect().height.toFixed(0) })).slice(0, 30);
    return hits;
  });
  log('REMIND_HITS', scan.length);
  scan.forEach(s => log('  RH', s.tag, s.t, s.x, s.y, s.w + 'x' + s.h, s.cls.slice(0, 40)));
  fs.writeFileSync(path.join(OUT, '25-remind.json'), JSON.stringify(scan, null, 1), 'utf8');
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
