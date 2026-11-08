/* 360°评估率 tooltip 提炼 - 09: 滚动触发分页加载 → hover 目标行 → 抓完整 popover DOM
 * 用法：node capture-rate-tooltip-09-paged-hover.js
 * 产出：out/rate-tooltip/09-huixiang.json / 09-aaron.json
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

  // 滚动到 offset 位置（50/页；先滚一段距离然后看是否触发分页加载）
  async function jumpToTarget(name, targetOffset) {
    log('JUMP_TO', name, 'offset', targetOffset);
    // 循环滚动到底部触发加载，直到目标出现在 DOM
    let guard = 0;
    while (guard < 12) {
      const r = await page.evaluate((name) => {
        const rows = [...document.querySelectorAll('tr,[class*=table-row],[class*=Row]')].filter(rr => rr.getBoundingClientRect().height > 30);
        const m = rows.find(rr => (rr.textContent || '').includes(name));
        return { inDom: !!m, total: rows.length };
      }, name);
      log('  check', name, r.inDom, 'rows', r.total);
      if (r.inDom) return true;
      // 滚到底
      const st = await page.evaluate(() => {
        const el = [...document.querySelectorAll('.simplebar-full-content')].find(e => e.scrollHeight > e.clientHeight + 30);
        if (!el) return null;
        el.scrollTop = el.scrollHeight;
        return { t: el.scrollTop, sh: el.scrollHeight, c: el.clientHeight };
      });
      await page.waitForTimeout(1500);
      guard++;
    }
    return false;
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
      return { x: +(rr.x + 30).toFixed(1), y: +(rr.y + rr.height / 2).toFixed(1), yTop: +rr.y.toFixed(1) };
    }, name);
    log('HOVER_PT', name, JSON.stringify(pt));
    if (!pt) return null;
    // 若行不在可视区先滚到行附近
    if (pt.yTop < 200 || pt.yTop > 1000) {
      await page.evaluate(() => { const el = [...document.querySelectorAll('.simplebar-full-content')].find(e => e.scrollHeight > e.clientHeight + 30); if (el) el.scrollTop = Math.max(0, el.scrollTop - 500); });
      await page.waitForTimeout(800);
    }
    await page.mouse.move(pt.x, pt.y, { steps: 8 });
    await page.waitForTimeout(2200);
    return fullPopup();
  }

  // huixiang offset 150
  const hxOk = await jumpToTarget('陈慧祥', 150);
  log('HX_LOADED', hxOk);
  const hx = hxOk ? await hoverTarget('陈慧祥') : null;
  log('HX_POPUP?', !!(hx && !hx.err));
  if (hx && !hx.err) {
    fs.writeFileSync(path.join(OUT, '09-huixiang.json'), JSON.stringify(hx, null, 1), 'utf8');
    await page.screenshot({ path: path.join(OUT, '09-huixiang.png') });
    log('HX rect', JSON.stringify(hx.rect), 'btns', hx.btns.map(b => b.t));
    log('HX textRows', (hx.textRows || []).map(r => r.t).join(' | '));
  } else log('HX err', JSON.stringify(hx));

  await page.mouse.move(1400, 120);
  await page.waitForTimeout(800);

  // aaron offset 250
  const aaronOk = await jumpToTarget('朱鹏旭', 250);
  log('AARON_LOADED', aaronOk);
  const aaron = aaronOk ? await hoverTarget('朱鹏旭') : null;
  log('AARON_POPUP?', !!(aaron && !aaron.err));
  if (aaron && !aaron.err) {
    fs.writeFileSync(path.join(OUT, '09-aaron.json'), JSON.stringify(aaron, null, 1), 'utf8');
    await page.screenshot({ path: path.join(OUT, '09-aaron.png') });
    log('AARON rect', JSON.stringify(aaron.rect), 'btns', aaron.btns.map(b => b.t));
    log('AARON textRows', (aaron.textRows || []).map(r => r.t).join(' | '));
  } else log('AARON err', JSON.stringify(aaron));

  fs.writeFileSync(path.join(OUT, '09-api.json'), JSON.stringify(apiReq, null, 1), 'utf8');
  log('API_REQ', apiReq.length);
  apiReq.forEach(r => log('  ', r.u.replace('https://idreamsky.feishu.cn', ''), (r.pd || '').slice(0, 120)));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
