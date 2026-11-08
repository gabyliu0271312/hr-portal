/* 360°评估率 tooltip 提炼 - 06: 不依赖搜索，DOM 定位行→滚动可见→hover→抓 popover
 * 用法：node capture-rate-tooltip-06-locate.js
 * 产出：out/rate-tooltip/06-aaron.json / 06-huixiang.json / 06-alice.json
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

  const apiResp = [];
  page.on('response', async res => {
    const u = res.url();
    if (u.includes('/perf/api/') && !/\.(js|css|png|svg|woff|ico)/.test(u)) {
      let body = ''; try { body = await res.text(); } catch {}
      apiResp.push({ u: u.slice(0, 260), st: res.status(), body: body.slice(0, 100000) });
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

  const fullPopup = () => page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const cs = el => { const c = getComputedStyle(el); return { display: c.display, pos: c.position, z: c.zIndex, bg: c.backgroundColor, c: c.color, fs: c.fontSize, fw: c.fontWeight, lh: c.lineHeight, br: c.borderRadius, bd: c.border, shadow: c.boxShadow, pd: c.padding, ff: c.fontFamily }; };
    const pop = document.querySelector('.ud__popover.EvaluateRatio-popover');
    if (!pop) return { err: 'no popover' };
    const pr = pop.getBoundingClientRect();
    const walk = (el, depth) => {
      if (depth > 5) return null;
      const rr = el.getBoundingClientRect();
      const kids = [...el.children].map(ch => walk(ch, depth + 1)).filter(Boolean);
      return { tag: el.tagName, cls: (el.className || '').toString().slice(0, 80), ...rect(el), cs: cs(el), text: (el.textContent || '').trim().slice(0, 150), children: kids.slice(0, 40) };
    };
    const tree = walk(pop, 0);
    const btns = [...pop.querySelectorAll('button, [role=button], [class*=btn]')].filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0).map(el => { const rr = el.getBoundingClientRect(); return { t: (el.textContent || '').trim().slice(0, 20), ...rect(el), cs: cs(el), cls: (el.className || '').toString().slice(0, 60) }; });
    const icons = [...pop.querySelectorAll('svg,[class*=icon],[class*=Icon],[class*=Icon]')].filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().width < 30).map(el => ({ cls: (el.className || '').toString().slice(0, 50), ...rect(el), svg: el.tagName === 'svg' ? el.outerHTML.slice(0, 250) : '' }));
    const textRows = [...pop.querySelectorAll('div,span,p,li')].filter(el => { const rr = el.getBoundingClientRect(); return rr.width > 0 && rr.height > 0 && (el.textContent || '').trim() && el.children.length <= 2; }).map(el => ({ t: (el.textContent || '').trim().slice(0, 60), ...rect(el), cls: (el.className || '').toString().slice(0, 50), cs: cs(el) }));
    return { rect: { x: +pr.x.toFixed(1), y: +pr.y.toFixed(1), w: +pr.width.toFixed(1), h: +pr.height.toFixed(1) }, cs: cs(pop), tree, btns, icons, textRows };
  });

  // 滚动并 hover 指定人（通过行文本定位）
  async function locateAndHover(name) {
    // 若不在当前 DOM，尝试滚动表格容器
    let pt = null;
    for (let i = 0; i < 20; i++) {
      pt = await page.evaluate((name) => {
        const row = [...document.querySelectorAll('tr,[class*=table-row],[class*=Row]')].find(r => (r.textContent || '').includes(name) && r.getBoundingClientRect().height > 30);
        if (!row) return null;
        const cell = [...row.querySelectorAll('td,[class*=cell]')].find(c => { const rr = c.getBoundingClientRect(); return rr.width > 0 && rr.height > 10 && rr.x > 2240 && rr.x < 2700; });
        if (!cell) return null;
        const rr = cell.getBoundingClientRect();
        return { x: +(rr.x + 30).toFixed(1), y: +(rr.y + rr.height / 2).toFixed(1), rowY: +rr.y.toFixed(1) };
      }, name);
      if (pt && pt.rowY > 250 && pt.rowY < 900) break;
      // 滚动表格
      const scrolled = await page.evaluate(() => {
        const scrollers = [...document.querySelectorAll('*')].filter(el => { const c = getComputedStyle(el); return (c.overflowY === 'auto' || c.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50; });
        for (const s of scrollers) { if (s.getBoundingClientRect().height > 200 && s.getBoundingClientRect().height < 900) { s.scrollTop += 600; return { ok: true, cls: (s.className || '').toString().slice(0, 50) }; } }
        return { ok: false };
      });
      if (!scrolled.ok) break;
      await page.waitForTimeout(500);
    }
    log('LOCATED', name, JSON.stringify(pt));
    if (!pt) return null;
    await page.mouse.move(pt.x, pt.y, { steps: 8 });
    await page.waitForTimeout(2200);
    return fullPopup();
  }

  // aaron
  const aaron = await locateAndHover('朱鹏旭');
  log('AARON', !!(aaron && !aaron.err));
  if (aaron && !aaron.err) {
    fs.writeFileSync(path.join(OUT, '06-aaron.json'), JSON.stringify(aaron, null, 1), 'utf8');
    await page.screenshot({ path: path.join(OUT, '06-aaron.png') });
    log('AARON rect', JSON.stringify(aaron.rect), 'btns', aaron.btns.map(b => b.t));
    log('AARON textRows', (aaron.textRows || []).map(r => r.t).join(' | '));
  } else log('AARON err', JSON.stringify(aaron));

  await page.mouse.move(1400, 120);
  await page.waitForTimeout(800);

  // huixiang
  const hx = await locateAndHover('陈慧祥');
  log('HX', !!(hx && !hx.err));
  if (hx && !hx.err) {
    fs.writeFileSync(path.join(OUT, '06-huixiang.json'), JSON.stringify(hx, null, 1), 'utf8');
    await page.screenshot({ path: path.join(OUT, '06-huixiang.png') });
    log('HX rect', JSON.stringify(hx.rect), 'btns', hx.btns.map(b => b.t));
    log('HX textRows', (hx.textRows || []).map(r => r.t).join(' | '));
  } else log('HX err', JSON.stringify(hx));

  await page.mouse.move(1400, 120);
  await page.waitForTimeout(800);

  // alice (肖惠方，需先滚动回顶部)
  const alice = await locateAndHover('肖惠方');
  log('ALICE', !!(alice && !alice.err));
  if (alice && !alice.err) {
    fs.writeFileSync(path.join(OUT, '06-alice.json'), JSON.stringify(alice, null, 1), 'utf8');
    await page.screenshot({ path: path.join(OUT, '06-alice.png') });
    log('ALICE rect', JSON.stringify(alice.rect), 'btns', alice.btns.map(b => b.t));
  } else log('ALICE err', JSON.stringify(alice));

  fs.writeFileSync(path.join(OUT, '06-api.json'), JSON.stringify(apiResp, null, 1), 'utf8');
  log('API', apiResp.length);
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
