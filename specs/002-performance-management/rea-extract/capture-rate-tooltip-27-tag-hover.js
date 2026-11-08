/* 360°评估率 tooltip 提炼 - 27: hover 未评估 person 标签 → 探测催办按钮出现
 * 用法：node capture-rate-tooltip-27-tag-hover.js
 * 产出：out/rate-tooltip/27-tag-hover.json
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

  async function curPage() {
    return await page.evaluate(() => { const a = document.querySelector('.ud__pagination-item-active'); return a ? parseInt((a.textContent || '').trim()) : 0; }).catch(() => 0);
  }
  async function clickPageDom(n) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const cur = await curPage();
      if (cur === n) return true;
      const done = await page.evaluate((n) => {
        const ul = document.querySelector('.ud__pagination');
        if (!ul) return { ok: false };
        const el = [...ul.querySelectorAll('li,button,a')].find(e => (e.textContent || '').trim() === String(n) && !/disabled/.test(e.className || ''));
        if (el) { el.click(); return { ok: true, via: 'page' }; }
        const next = [...ul.querySelectorAll('li,button')].find(e => /next/.test(e.className || '') && !/disabled/.test(e.className || ''));
        if (next) { next.click(); return { ok: true, via: 'next' }; }
        return { ok: false };
      }, n);
      if (!done.ok) { await page.waitForTimeout(2000); continue; }
      await page.waitForTimeout(3000);
    }
    return await curPage() === n;
  }

  await clickPageDom(6);
  // 诊断当前页
  const diag = await page.evaluate(() => {
    const cur = document.querySelector('.ud__pagination-item-active');
    const names = [...document.querySelectorAll('tr,[class*=table-row],[class*=Row]')].filter(rr => rr.getBoundingClientRect().height > 30).map(rr => (rr.textContent || '').trim().slice(0, 40)).slice(0, 12);
    return { page: cur ? (cur.textContent || '').trim() : '?', names };
  });
  log('DIAG', JSON.stringify(diag));
  // scrollIntoView 朱鹏旭
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr,[class*=table-row],[class*=Row]')].find(rr => (rr.textContent || '').includes('朱鹏旭') && rr.getBoundingClientRect().height > 30);
    if (row) row.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(1000);
  // hover 360°cell 触发弹窗
  const pt = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('tr,[class*=table-row],[class*=Row]')].filter(rr => (rr.textContent || '').includes('朱鹏旭') && rr.getBoundingClientRect().height > 30);
    if (!rows.length) return { err: 'no row', rows: 0 };
    const row = rows[0];
    const rr0 = row.getBoundingClientRect();
    const cells = [...row.querySelectorAll('td,[class*=cell]')].filter(c => { const rr = c.getBoundingClientRect(); return rr.width > 0 && rr.height > 10; }).map(c => { const rr = c.getBoundingClientRect(); return { x: +rr.x.toFixed(0), y: +rr.y.toFixed(0), w: +rr.width.toFixed(0), t: (c.textContent || '').trim().slice(0, 12) }; });
    const cell = cells.find(c => c.x > 2240 && c.x < 2700);
    if (!cell) return { err: 'no cell', rowY: +rr0.y.toFixed(0), rowH: +rr0.height.toFixed(0), cells };
    return { x: +(cell.x + 30).toFixed(1), y: +(cell.y + rr0.height / 2).toFixed(1), cells: cells.slice(-6) };
  });
  log('CELL_PT', JSON.stringify(pt));
  if (!pt || pt.err) { log('no cell', JSON.stringify(pt).slice(0, 400)); process.exit(0); }
  await page.mouse.move(pt.x, pt.y, { steps: 8 });
  await page.waitForTimeout(6000);
  // 抓弹窗内 person 标签位置
  const tags = await page.evaluate(() => {
    const pop = document.querySelector('.ud__popover.EvaluateRatio-popover');
    if (!pop) return { err: 'no popover' };
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +(r.x).toFixed(1), y: +(r.y).toFixed(1), w: +(r.width).toFixed(1), h: +(r.height).toFixed(1) }; };
    const all = [...pop.querySelectorAll('*')].filter(el => (el.textContent || '').trim() && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0 && [...el.childNodes].every(n => n.nodeType !== 1)).map(el => ({ t: (el.textContent || '').trim().slice(0, 30), ...rect(el), tag: el.tagName, cls: (el.className || '').toString().slice(0, 50) }));
    return { tags: all };
  });
  log('POPUP_TAGS', JSON.stringify(tags.tags, null, 1).slice(0, 1500));
  fs.writeFileSync(path.join(OUT, '27-tag-hover.json'), JSON.stringify(tags, null, 1), 'utf8');

  // 找 ryan1.zhang 标签位置
  const ryan = tags.tags && tags.tags.find(t => t.t.includes('张宏宇'));
  log('RYAN', JSON.stringify(ryan));
  if (ryan) {
    // 先移到标签上
    await page.mouse.move(ryan.x + ryan.w / 2, ryan.y + ryan.h / 2, { steps: 5 });
    await page.waitForTimeout(1500);
    // 抓是否有催办按钮出现（新 popover / 按钮）
    const probe = await page.evaluate(() => {
      const rect = el => { const r = el.getBoundingClientRect(); return { x: +(r.x).toFixed(1), y: +(r.y).toFixed(1), w: +(r.width).toFixed(1), h: +(r.height).toFixed(1) }; };
      const cs = el => { const c = getComputedStyle(el); return { bg: c.backgroundColor, c: c.color, fs: c.fontSize, fw: c.fontWeight, br: c.borderRadius, pd: c.padding, bd: c.border }; };
      // 新出现的按钮/浮层
      const popovers = [...document.querySelectorAll('.ud__popover')].filter(el => el.getBoundingClientRect().width > 0).map(el => ({ cls: (el.className || '').toString().slice(0, 70), ...rect(el), t: (el.textContent || '').trim().slice(0, 120) }));
      const btns = [...document.querySelectorAll('button,a,[role=button],[class*=btn],[class*=remind],[class*=Remind],[class*=urge]')].filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().y > 500).map(el => ({ tag: el.tagName, t: (el.textContent || '').trim().slice(0, 20), ...rect(el), cs: cs(el), cls: (el.className || '').toString().slice(0, 60) }));
      return { popovers, btns };
    });
    log('AFTER_TAG_HOVER', JSON.stringify(probe, null, 1).slice(0, 2500));
    fs.writeFileSync(path.join(OUT, '27-tag-hover2.json'), JSON.stringify(probe, null, 1), 'utf8');
    await page.screenshot({ path: path.join(OUT, '27-tag-hover.png') });
  }
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
