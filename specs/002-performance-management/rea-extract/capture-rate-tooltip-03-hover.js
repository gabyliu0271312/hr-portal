/* 360°评估率 tooltip 提炼 - 03: 搜索定位三人，hover 抓 tooltip DOM + 接口
 * 用法：node capture-rate-tooltip-03-hover.js
 * 产出：out/rate-tooltip/03-alice.json(0/0) 03-aaron.json(1/2) 03-huixiang.json(0/1)
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

const capture = (page, label) => page.evaluate((label) => {
  const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const cs = el => { const c = getComputedStyle(el); return { display: c.display, bg: c.backgroundColor, c: c.color, fs: c.fontSize, fw: c.fontWeight, lh: c.lineHeight, br: c.borderRadius, bd: c.border, pd: c.padding, shadow: c.boxShadow, pos: c.position, ff: c.fontFamily }; };
  // 找 hover 弹窗：通常是浮层，位于表格上方
  const layers = [...document.querySelectorAll('div,[class*=tooltip],[class*=Tooltip],[class*=popover],[class*=Popover],[class*=popup],[class*=Popup],[class*=float],[class*=Float]')]
    .filter(el => {
      const rr = el.getBoundingClientRect();
      if (rr.width < 80 || rr.width > 900 || rr.height < 20 || rr.height > 900) return false;
      if (rr.x < 100 || rr.y < 200) return false;
      return true;
    })
    .sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)
    .slice(0, 6)
    .map(el => {
      const rr = el.getBoundingClientRect();
      const ownText = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).filter(Boolean).join('');
      const children = [...el.children].map(ch => ({ tag: ch.tagName, cls: (ch.className || '').toString().slice(0, 60), t: (ch.textContent || '').trim().slice(0, 120), ...rect(ch), cs: cs(ch) }));
      return { label, tag: el.tagName, cls: (el.className || '').toString().slice(0, 80), ...rect(el), ownText: ownText.slice(0, 80), shadow: cs(el).shadow, children: children.slice(0, 40) };
    });
  return { label, layers };
}, label);

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
      apiResp.push({ u: u.slice(0, 260), st: res.status(), body: body.slice(0, 60000) });
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

  // 找搜索框
  const searchSel = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')].filter(el => el.offsetParent !== null);
    return inputs.map(el => ({ type: el.type, ph: el.placeholder, role: el.getAttribute('role'), aria: el.getAttribute('aria-label'), cls: (el.className || '').toString().slice(0, 60), rect: (() => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(0), y: +r.y.toFixed(0), w: +r.width.toFixed(0), h: +r.height.toFixed(0) }; })() }));
  });
  fs.writeFileSync(path.join(OUT, '03-search-inputs.json'), JSON.stringify(searchSel, null, 1), 'utf8');
  log('INPUTS', searchSel.length);
  searchSel.forEach(s => log('  IN', s.ph, s.role, s.aria, JSON.stringify(s.rect)));

  async function search(name) {
    const r = await page.evaluate((name) => {
      const input = [...document.querySelectorAll('input')].find(el => el.offsetParent !== null && (/搜索/.test(el.placeholder) || /搜索/.test(el.getAttribute('aria-label') || '') || el.offsetParent.closest('[class*=search]')));
      if (!input) return { err: 'no search input' };
      const rr = input.getBoundingClientRect();
      return { ok: true, x: rr.x + rr.width / 2, y: rr.y + rr.height / 2, ph: input.placeholder, cls: (input.className || '').toString().slice(0, 60) };
    }, name);
    if (r.err) { log('NO_SEARCH', name); return false; }
    await page.mouse.click(r.x, r.y);
    await page.waitForTimeout(500);
    // 清空再输入
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(name, { delay: 60 });
    await page.waitForTimeout(1200);
    log('SEARCHED', name);
    return true;
  }

  async function hoverRateCell(person) {
    // 找该人员行的 360°评估率 cell 中心点
    const pt = await page.evaluate((person) => {
      // 360°评估率列 x 2240~2690
      const cells = [...document.querySelectorAll('td,[class*=cell]')].filter(el => {
        const rr = el.getBoundingClientRect();
        return rr.width > 0 && rr.height > 10 && rr.x > 2240 && rr.x < 2700;
      });
      for (const c of cells) {
        const rr = c.getBoundingClientRect();
        const row = c.closest('tr, [class*=table-row], [class*=Row]');
        if (!row) continue;
        const rowText = (row.textContent || '');
        if (rowText.includes(person)) {
          return { x: +(rr.x + rr.width / 2).toFixed(1), y: +(rr.y + rr.height / 2).toFixed(1), w: +rr.width.toFixed(1), h: +rr.height.toFixed(1) };
        }
      }
      return null;
    }, person);
    log('HOVER_PT', person, JSON.stringify(pt));
    if (!pt) return false;
    await page.mouse.move(pt.x, pt.y, { steps: 5 });
    await page.waitForTimeout(1800);
    return true;
  }

  const results = [];
  for (const person of ['肖惠方', '朱鹏旭', '陈慧祥']) {
    const ok = await search(person);
    if (!ok) continue;
    // 等列表刷新
    await page.waitForTimeout(2000);
    // 若搜索无结果则无行
    const hasRow = await page.evaluate((person) => [...document.querySelectorAll('tr,[class*=table-row]')].some(r => (r.textContent || '').includes(person) && r.getBoundingClientRect().height > 30), person);
    log('HAS_ROW', person, hasRow);
    if (!hasRow) continue;
    const hovered = await hoverRateCell(person);
    if (!hovered) { log('NO_RATE_CELL', person); continue; }
    const snap = await capture(page, person);
    results.push(snap);
    fs.writeFileSync(path.join(OUT, `03-${person}-hover.json`), JSON.stringify(snap, null, 1), 'utf8');
    await page.screenshot({ path: path.join(OUT, `03-${person}-hover.png`) });
    log('CAPTURED', person, 'layers', snap.layers.length);
    snap.layers.forEach(l => log('   LAYER', l.tag, l.cls.slice(0, 40), l.x, l.y, l.w, l.h, 'text', l.ownText.slice(0, 30)));
    // 移开
    await page.mouse.move(1400, 120);
    await page.waitForTimeout(800);
  }

  // 接口
  fs.writeFileSync(path.join(OUT, '03-api.json'), JSON.stringify(apiResp, null, 1), 'utf8');
  log('API_REQ', apiResp.length);
  apiResp.forEach(a => log('  API', a.st, a.u.replace('https://idreamsky.feishu.cn', '')));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
