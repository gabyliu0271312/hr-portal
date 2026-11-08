/* 360°评估率 tooltip 提炼 - 24: 等 person 数据加载完成后抓离职说明 + 完整标签 HTML
 * 用法：node capture-rate-tooltip-24-dimission.js
 * 产出：out/rate-tooltip/24-hx-full.json
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
    if (u.includes('/perf/api/') && !/\.(js|css|png|svg|woff|ico)/.test(u) && !u.includes('report/v3/semesters')) {
      let body = ''; try { body = await res.text(); } catch {}
      apiResp.push({ u: u.slice(0, 260), st: res.status(), body: body.slice(0, 30000) });
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
    // 等 person 异步加载完成
    await page.waitForTimeout(6000);
    return true;
  }

  await clickPageDom(4);
  await hoverTarget('陈慧祥');
  const detail = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const cs = el => { const c = getComputedStyle(el); return { display: c.display, bg: c.backgroundColor, c: c.color, fs: c.fontSize, fw: c.fontWeight, lh: c.lineHeight, br: c.borderRadius, pd: c.padding, bd: c.border }; };
    const pop = document.querySelector('.ud__popover.EvaluateRatio-popover');
    if (!pop) return { err: 'no popover' };
    const pr = pop.getBoundingClientRect();
    // 完整 innerHTML（清洗）
    const lists = [...pop.querySelectorAll('[class*=EmpLabelList]')].map(el => ({ cls: (el.className || '').toString().slice(0, 60), inner: el.innerHTML.replace(/\s+/g, ' ').slice(0, 3000) }));
    // 所有叶子文本 + 样式
    const leaves = [];
    const walk = (el, depth) => {
      const rr = el.getBoundingClientRect();
      if (rr.width <= 0 || rr.height <= 0) return;
      const isLeaf = [...el.childNodes].every(n => n.nodeType !== 1);
      if (isLeaf) {
        const t = (el.textContent || '').trim();
        if (t) leaves.push({ t: t.slice(0, 60), ...rect(el), cs: cs(el), tag: el.tagName, cls: (el.className || '').toString().slice(0, 60) });
      } else if (depth < 10) [...el.children].forEach(c => walk(c, depth + 1));
    };
    walk(pop, 0);
    // 含"离职"文字
    const dim = leaves.filter(l => /离职|离/.test(l.t));
    return { rect: { x: +pr.x.toFixed(1), y: +pr.y.toFixed(1), w: +pr.width.toFixed(1), h: +pr.height.toFixed(1) }, lists, leaves, dimissionLeaves: dim };
  });
  fs.writeFileSync(path.join(OUT, '24-hx-full.json'), JSON.stringify(detail, null, 1), 'utf8');
  log('HX_LEAVES', detail.leaves.length, 'DIMISSION', detail.dimissionLeaves.length);
  detail.leaves.forEach(l => log('  LV', l.t, l.x, l.y, l.w + 'x' + l.h, JSON.stringify({bg: l.cs.bg, c: l.cs.c, fw: l.cs.fw, fs: l.cs.fs, pd: l.cs.pd, br: l.cs.br, bd: l.cs.bd})));
  (detail.dimissionLeaves || []).forEach(d => log('  DIM', d.t, d.x, d.y, d.w + 'x' + d.h, JSON.stringify({bg: d.cs.bg, c: d.cs.c, fw: d.cs.fw, fs: d.cs.fs})));
  await page.screenshot({ path: path.join(OUT, '24-hx-full.png') });

  log('---API (non-list)---');
  apiResp.filter(a => /user|emp|member|person|contact/i.test(a.u)).forEach(a => log('  ', a.st, a.u.replace('https://idreamsky.feishu.cn', ''), (a.body || '').slice(0, 100)));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
