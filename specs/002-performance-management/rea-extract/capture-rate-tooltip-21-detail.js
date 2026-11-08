/* 360°评估率 tooltip 提炼 - 21: 精确抓取 EmpLabelList 容器内部结构（离职标签/催办按钮/已评估未评估分区）
 * 用法：node capture-rate-tooltip-21-detail.js
 * 产出：out/rate-tooltip/21-huixiang-detail.json / 21-aaron-detail.json
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

  async function clickPageDom(n) {
    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
    await page.waitForTimeout(600);
    const done = await page.evaluate((n) => {
      const ul = document.querySelector('.ud__pagination');
      if (!ul) return { ok: false, err: 'no ul' };
      const items = [...ul.querySelectorAll('li,button,a')];
      const el = items.find(e => (e.textContent || '').trim() === String(n) && !/disabled/.test(e.className || ''));
      if (el) { el.click(); return { ok: true, via: 'page' }; }
      const next = [...ul.querySelectorAll('li,button')].find(e => /next/.test(e.className || '') && !/disabled/.test(e.className || ''));
      if (next) { next.click(); return { ok: true, via: 'next' }; }
      return { ok: false };
    }, n);
    log('CLICK_PAGE', n, JSON.stringify(done));
    if (!done.ok) return false;
    await page.waitForTimeout(2500);
    if (done.via === 'next') {
      const cur = await page.evaluate(() => { const a = document.querySelector('.ud__pagination-item-active'); return a ? parseInt((a.textContent || '').trim()) : 0; });
      if (cur !== n) {
        await page.evaluate((n) => { const ul = document.querySelector('.ud__pagination'); if (!ul) return; const el = [...ul.querySelectorAll('li,button,a')].find(e => (e.textContent || '').trim() === String(n) && !/disabled/.test(e.className || '')); if (el) el.click(); }, n);
        await page.waitForTimeout(2500);
      }
    }
    await page.evaluate(() => { window.scrollTo(0, 0); });
    await page.waitForTimeout(800);
    return true;
  }

  async function hoverTarget(name) {
    await page.evaluate((name) => {
      const row = [...document.querySelectorAll('tr,[class*=table-row],[class*=Row]')].find(rr => (rr.textContent || '').includes(name) && rr.getBoundingClientRect().height > 30);
      if (row) row.scrollIntoView({ block: 'center' });
    }, name);
    await page.waitForTimeout(1000);
    const pt = await page.evaluate((name) => {
      const row = [...document.querySelectorAll('tr,[class*=table-row],[class*=Row]')].find(rr => (rr.textContent || '').includes(name) && rr.getBoundingClientRect().height > 30);
      if (!row) return null;
      const cell = [...row.querySelectorAll('td,[class*=cell]')].find(c => { const rr = c.getBoundingClientRect(); return rr.width > 0 && rr.height > 10 && rr.x > 2240 && rr.x < 2700; });
      if (!cell) return null;
      const rr = cell.getBoundingClientRect();
      return { x: +(rr.x + 30).toFixed(1), y: +(rr.y + rr.height / 2).toFixed(1) };
    }, name);
    if (!pt) return null;
    await page.mouse.move(pt.x, pt.y, { steps: 8 });
    await page.waitForTimeout(2200);
    return true;
  }

  const detail = () => page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const cs = el => { const c = getComputedStyle(el); return { display: c.display, bg: c.backgroundColor, c: c.color, fs: c.fontSize, fw: c.fontWeight, lh: c.lineHeight, br: c.borderRadius, pd: c.padding, mg: c.margin, flex: c.flexDirection, gap: c.gap, alignItems: c.alignItems, justifyContent: c.justifyContent }; };
    const pop = document.querySelector('.ud__popover.EvaluateRatio-popover');
    if (!pop) return { err: 'no popover' };
    const pr = pop.getBoundingClientRect();
    // 收集 pop 内所有叶子文本元素 + 容器（flat list，带层级）
    const flat = [];
    const collect = (el, depth) => {
      const rr = el.getBoundingClientRect();
      if (rr.width <= 0 || rr.height <= 0) return;
      const t = (el.textContent || '').trim();
      const isLeaf = [...el.childNodes].every(n => n.nodeType !== 1);
      flat.push({ depth, tag: el.tagName, cls: (el.className || '').toString().slice(0, 70), ...rect(el), cs: cs(el), t: t.slice(0, 60), isLeaf });
      if (isLeaf) return;
      [...el.children].forEach(c => collect(c, depth + 1));
    };
    collect(pop, 0);
    // 图标
    const icons = [...pop.querySelectorAll('svg')].filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().width < 40).map(el => ({ ...rect(el), inner: el.outerHTML.slice(0, 200) }));
    return { rect: { x: +pr.x.toFixed(1), y: +pr.y.toFixed(1), w: +pr.width.toFixed(1), h: +pr.height.toFixed(1) }, flat, icons };
  });

  // huixiang page 4
  await clickPageDom(4);
  await hoverTarget('陈慧祥');
  const hx = await detail();
  fs.writeFileSync(path.join(OUT, '21-huixiang-detail.json'), JSON.stringify(hx, null, 1), 'utf8');
  log('HX_DETAIL', hx.flat.length, 'icons', hx.icons.length);
  hx.flat.forEach(f => { if (f.t || f.isLeaf || f.cls.includes('EmpLabel') || f.cls.includes('Dismission') || f.cls.includes('flex')) log('  HX', f.depth, f.tag, f.cls.slice(0, 45), f.w + 'x' + f.h, 't=' + (f.t || '').slice(0, 30), JSON.stringify({ bg: f.cs.bg, c: f.cs.c, fw: f.cs.fw, fs: f.cs.fs, pd: f.cs.pd })); });

  await page.mouse.move(1400, 120);
  await page.waitForTimeout(800);

  // aaron page 6
  await clickPageDom(6);
  await hoverTarget('朱鹏旭');
  const ar = await detail();
  fs.writeFileSync(path.join(OUT, '21-aaron-detail.json'), JSON.stringify(ar, null, 1), 'utf8');
  log('AARON_DETAIL', ar.flat.length, 'icons', ar.icons.length);
  ar.flat.forEach(f => { if (f.t || f.isLeaf || f.cls.includes('EmpLabel') || f.cls.includes('Dismission') || f.cls.includes('flex')) log('  AR', f.depth, f.tag, f.cls.slice(0, 45), f.w + 'x' + f.h, 't=' + (f.t || '').slice(0, 30), JSON.stringify({ bg: f.cs.bg, c: f.cs.c, fw: f.cs.fw, fs: f.cs.fs, pd: f.cs.pd })); });

  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
