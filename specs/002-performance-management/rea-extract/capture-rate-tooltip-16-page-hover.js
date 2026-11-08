/* 360°评估率 tooltip 提炼 - 16: 点击分页器跳页 → hover 目标行 → 抓完整 popover DOM
 * 用法：node capture-rate-tooltip-16-page-hover.js
 * 产出：out/rate-tooltip/16-huixiang.json / 16-aaron.json
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

  // 先滚回顶部
  await page.evaluate(() => { window.scrollTo(0, 0); });
  await page.waitForTimeout(500);

  // 点击分页页码 N
  async function clickPage(n) {
    // 分页器在 y~2968（页面底部），先滚到那里
    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
    await page.waitForTimeout(800);
    const pt = await page.evaluate((n) => {
      const ul = document.querySelector('.ud__pagination');
      if (!ul) return null;
      const items = [...ul.querySelectorAll('li,[class*=item],[class*=pagination-item],button,a,span')];
      // 找数字 n 的页码
      const el = items.find(e => (e.textContent || '').trim() === String(n) && e.getBoundingClientRect().width > 0);
      if (!el) return null;
      const rr = el.getBoundingClientRect();
      return { x: +(rr.x + rr.width / 2).toFixed(1), y: +(rr.y + rr.height / 2).toFixed(1) };
    }, n);
    log('PAGE_PT', n, JSON.stringify(pt));
    if (!pt) return false;
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(2500);
    // 滚回顶部看新数据
    await page.evaluate(() => { window.scrollTo(0, 0); });
    await page.waitForTimeout(800);
    return true;
  }

  const fullPopup = () => page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const cs = el => { const c = getComputedStyle(el); return { display: c.display, pos: c.position, z: c.zIndex, bg: c.backgroundColor, c: c.color, fs: c.fontSize, fw: c.fontWeight, lh: c.lineHeight, br: c.borderRadius, bd: c.border, shadow: c.boxShadow, pd: c.padding, ff: c.fontFamily }; };
    const pop = document.querySelector('.ud__popover.EvaluateRatio-popover');
    if (!pop) return { err: 'no popover' };
    const pr = pop.getBoundingClientRect();
    const walk = (el, depth) => {
      if (depth > 6) return null;
      const rr = el.getBoundingClientRect();
      const kids = [...el.children].map(ch => walk(ch, depth + 1)).filter(Boolean);
      return { tag: el.tagName, cls: (el.className || '').toString().slice(0, 80), ...rect(el), cs: cs(el), text: (el.textContent || '').trim().slice(0, 150), children: kids.slice(0, 40) };
    };
    const tree = walk(pop, 0);
    const btns = [...pop.querySelectorAll('button, [role=button], [class*=btn]')].filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0).map(el => { const rr = el.getBoundingClientRect(); return { t: (el.textContent || '').trim().slice(0, 20), ...rect(el), cs: cs(el), cls: (el.className || '').toString().slice(0, 60) }; });
    const icons = [...pop.querySelectorAll('svg')].filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().width < 40).map(el => ({ cls: (el.className || '').toString().slice(0, 50), ...rect(el), inner: el.outerHTML.slice(0, 300) }));
    const textRows = [...pop.querySelectorAll('div,span,p,li')].filter(el => { const rr = el.getBoundingClientRect(); return rr.width > 0 && rr.height > 0 && (el.textContent || '').trim() && el.children.length <= 3; }).map(el => ({ t: (el.textContent || '').trim().slice(0, 80), ...rect(el), cls: (el.className || '').toString().slice(0, 50), cs: cs(el) }));
    return { rect: { x: +pr.x.toFixed(1), y: +pr.y.toFixed(1), w: +pr.width.toFixed(1), h: +pr.height.toFixed(1) }, cs: cs(pop), tree, btns, icons, textRows };
  });

  async function hoverTarget(name) {
    const pt = await page.evaluate((name) => {
      const row = [...document.querySelectorAll('tr,[class*=table-row],[class*=Row]')].find(rr => (rr.textContent || '').includes(name) && rr.getBoundingClientRect().height > 30);
      if (!row) return null;
      const cell = [...row.querySelectorAll('td,[class*=cell]')].find(c => { const rr = c.getBoundingClientRect(); return rr.width > 0 && rr.height > 10 && rr.x > 2240 && rr.x < 2700; });
      if (!cell) return null;
      const rr = cell.getBoundingClientRect();
      return { x: +(rr.x + 30).toFixed(1), y: +(rr.y + rr.height / 2).toFixed(1) };
    }, name);
    log('HOVER_PT', name, JSON.stringify(pt));
    if (!pt) return null;
    await page.mouse.move(pt.x, pt.y, { steps: 8 });
    await page.waitForTimeout(2200);
    return fullPopup();
  }

  // huixiang 在第 4 页 (offset 150)
  const p4 = await clickPage(4);
  log('PAGE4_OK', p4);
  // 先确认 huixiang 在页内
  const inDom = await page.evaluate(() => [...document.querySelectorAll('tr,[class*=table-row],[class*=Row]')].some(r => (r.textContent || '').includes('陈慧祥') && r.getBoundingClientRect().height > 30));
  log('HX_IN_PAGE4', inDom);
  const hx = inDom ? await hoverTarget('陈慧祥') : null;
  log('HX_POPUP?', !!(hx && !hx.err));
  if (hx && !hx.err) {
    fs.writeFileSync(path.join(OUT, '16-huixiang.json'), JSON.stringify(hx, null, 1), 'utf8');
    await page.screenshot({ path: path.join(OUT, '16-huixiang.png') });
    log('HX rect', JSON.stringify(hx.rect), 'btns', hx.btns.map(b => b.t));
    log('HX textRows', (hx.textRows || []).map(r => r.t).join(' | '));
  } else log('HX err', JSON.stringify(hx));

  await page.mouse.move(1400, 120);
  await page.waitForTimeout(800);

  // aaron 在第 6 页 (offset 250)
  const p6 = await clickPage(6);
  log('PAGE6_OK', p6);
  const inDom2 = await page.evaluate(() => [...document.querySelectorAll('tr,[class*=table-row],[class*=Row]')].some(r => (r.textContent || '').includes('朱鹏旭') && r.getBoundingClientRect().height > 30));
  log('AARON_IN_PAGE6', inDom2);
  const aaron = inDom2 ? await hoverTarget('朱鹏旭') : null;
  log('AARON_POPUP?', !!(aaron && !aaron.err));
  if (aaron && !aaron.err) {
    fs.writeFileSync(path.join(OUT, '16-aaron.json'), JSON.stringify(aaron, null, 1), 'utf8');
    await page.screenshot({ path: path.join(OUT, '16-aaron.png') });
    log('AARON rect', JSON.stringify(aaron.rect), 'btns', aaron.btns.map(b => b.t));
    log('AARON textRows', (aaron.textRows || []).map(r => r.t).join(' | '));
  } else log('AARON err', JSON.stringify(aaron));

  fs.writeFileSync(path.join(OUT, '16-api.json'), JSON.stringify(apiReq, null, 1), 'utf8');
  log('---API---');
  apiReq.forEach(r => log('  ', r.u.replace('https://idreamsky.feishu.cn', ''), (r.pd || '').slice(0, 150)));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
