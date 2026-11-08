/* 360°评估率 tooltip 提炼 - 22: 抓 EmpLabelList 内 person 标签完整结构（离职徽标/催办按钮）
 * 用法：node capture-rate-tooltip-22-person-label.js
 * 产出：out/rate-tooltip/22-hx-labels.json / 22-aaron-labels.json
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
      if (!ul) return { ok: false };
      const el = [...ul.querySelectorAll('li,button,a')].find(e => (e.textContent || '').trim() === String(n) && !/disabled/.test(e.className || ''));
      if (el) { el.click(); return { ok: true, via: 'page' }; }
      const next = [...ul.querySelectorAll('li,button')].find(e => /next/.test(e.className || '') && !/disabled/.test(e.className || ''));
      if (next) { next.click(); return { ok: true, via: 'next' }; }
      return { ok: false };
    }, n);
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

  const labels = () => page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const cs = el => { const c = getComputedStyle(el); return { display: c.display, bg: c.backgroundColor, c: c.color, fs: c.fontSize, fw: c.fontWeight, lh: c.lineHeight, br: c.borderRadius, pd: c.padding, bd: c.border, align: c.alignItems, flex: c.flexDirection }; };
    const pop = document.querySelector('.ud__popover.EvaluateRatio-popover');
    if (!pop) return { err: 'no popover' };
    // 找 EmpLabelList 容器
    const lists = [...pop.querySelectorAll('[class*=EmpLabelList]')].map(el => {
      const rr = el.getBoundingClientRect();
      // 该容器内部所有叶子文本 + 子元素（含 person 标签）
      const rows = [...el.querySelectorAll(':scope > *')].map(ch => {
        const chr = ch.getBoundingClientRect();
        const text = (ch.textContent || '').trim();
        const kids = [...ch.children].map(gc => {
          const gcr = gc.getBoundingClientRect();
          return { tag: gc.tagName, cls: (gc.className || '').toString().slice(0, 60), ...rect(gc), cs: cs(gc), t: (gc.textContent || '').trim().slice(0, 40) };
        });
        return { tag: ch.tagName, cls: (ch.className || '').toString().slice(0, 70), ...rect(ch), cs: cs(ch), t: text.slice(0, 60), kids };
      });
      return { cls: (el.className || '').toString().slice(0, 80), ...rect(el), rows };
    });
    // 所有叶子文本（含离职等）
    const texts = [];
    const walk = (el, depth) => {
      const rr = el.getBoundingClientRect();
      if (rr.width <= 0 || rr.height <= 0) return;
      const t = (el.textContent || '').trim();
      const isLeaf = [...el.childNodes].every(n => n.nodeType !== 1);
      if (isLeaf && t) texts.push({ t: t.slice(0, 50), ...rect(el), cs: cs(el), tag: el.tagName, cls: (el.className || '').toString().slice(0, 50) });
      else if (depth < 8) [...el.children].forEach(c => walk(c, depth + 1));
    };
    walk(pop, 0);
    return { lists, texts };
  });

  // huixiang page 4
  await clickPageDom(4);
  await hoverTarget('陈慧祥');
  const hx = await labels();
  fs.writeFileSync(path.join(OUT, '22-hx-labels.json'), JSON.stringify(hx, null, 1), 'utf8');
  log('HX_LISTS', hx.lists ? hx.lists.length : 0);
  (hx.lists || []).forEach(l => {
    log('  LIST', l.cls.slice(0, 60), l.w + 'x' + l.h, 'rows', l.rows.length);
    l.rows.forEach(r => log('    ROW', r.tag, r.cls.slice(0, 40), 't=' + r.t.slice(0, 30), 'kids', r.kids.length, r.kids.map(k => k.t + '|' + k.cls.slice(0, 25)).join(' / ')));
  });
  log('  HX_TEXTS');
  (hx.texts || []).forEach(t => log('    TXT', t.t, t.x, t.y, t.w + 'x' + t.h, JSON.stringify({bg: t.cs.bg, c: t.cs.c, fw: t.cs.fw, fs: t.cs.fs, pd: t.cs.pd})));

  await page.mouse.move(1400, 120);
  await page.waitForTimeout(800);

  // aaron page 6
  await clickPageDom(6);
  await hoverTarget('朱鹏旭');
  const ar = await labels();
  fs.writeFileSync(path.join(OUT, '22-aaron-labels.json'), JSON.stringify(ar, null, 1), 'utf8');
  log('AR_LISTS', ar.lists ? ar.lists.length : 0);
  (ar.lists || []).forEach(l => {
    log('  LIST', l.cls.slice(0, 60), l.w + 'x' + l.h, 'rows', l.rows.length);
    l.rows.forEach(r => log('    ROW', r.tag, r.cls.slice(0, 40), 't=' + r.t.slice(0, 30), 'kids', r.kids.length, r.kids.map(k => k.t + '|' + k.cls.slice(0, 25)).join(' / ')));
  });
  log('  AR_TEXTS');
  (ar.texts || []).forEach(t => log('    TXT', t.t, t.x, t.y, t.w + 'x' + t.h, JSON.stringify({bg: t.cs.bg, c: t.cs.c, fw: t.cs.fw, fs: t.cs.fs, pd: t.cs.pd})));

  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
