/* 360°评估率 tooltip 提炼 - 23: 抓 person 标签完整 HTML（离职徽标/文案）+ 催办按钮定位
 * 用法：node capture-rate-tooltip-23-html.js
 * 产出：out/rate-tooltip/23-hx-html.txt / 23-aaron-html.txt
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

  const html = () => page.evaluate(() => {
    const pop = document.querySelector('.ud__popover.EvaluateRatio-popover');
    if (!pop) return { err: 'no popover' };
    // 完整 HTML（含 person 标签，标签可能内嵌 svg）
    const lists = [...pop.querySelectorAll('[class*=EmpLabelList]')].map(el => ({
      cls: (el.className || '').toString().slice(0, 80),
      inner: el.innerHTML.replace(/\s+/g, ' ').slice(0, 2000),
    }));
    // person 标签元素
    const tags = [...pop.querySelectorAll('[class*=EmpLabel],[class*=person],[class*=Person],[class*=tag],[class*=Tag],[class*=member],[class*=Member]')].filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0).map(el => ({
      cls: (el.className || '').toString().slice(0, 70),
      t: (el.textContent || '').trim().slice(0, 50),
      inner: el.outerHTML.replace(/\s+/g, ' ').slice(0, 600),
    }));
    // 含"离职"关键词的文本
    const dimission = [];
    const walk = el => {
      const t = (el.textContent || '').trim();
      if (t.includes('离职') || t.includes('已离职') || t.includes('离')) dimission.push({ t: t.slice(0, 60), cls: (el.className || '').toString().slice(0, 60), html: el.outerHTML.replace(/\s+/g, ' ').slice(0, 300) });
      [...el.children].forEach(walk);
    };
    walk(pop);
    return { lists, tags, dimission };
  });

  // huixiang page 4
  await clickPageDom(4);
  await hoverTarget('陈慧祥');
  const hx = await html();
  fs.writeFileSync(path.join(OUT, '23-hx-html.json'), JSON.stringify(hx, null, 1), 'utf8');
  log('HX_LISTS', hx.lists ? hx.lists.length : 0);
  (hx.lists || []).forEach(l => log('  LIST', l.cls.slice(0, 60), l.inner.slice(0, 600)));
  log('HX_TAGS', hx.tags ? hx.tags.length : 0);
  (hx.tags || []).forEach(t => log('  TAG', t.cls.slice(0, 50), 't=' + t.t.slice(0, 30), t.inner.slice(0, 250)));
  log('HX_DIMISSION', (hx.dimission || []).length);
  (hx.dimission || []).forEach(d => log('  DIM', d.t.slice(0, 40), d.cls.slice(0, 40), d.html.slice(0, 150)));

  await page.mouse.move(1400, 120);
  await page.waitForTimeout(800);

  // aaron page 6
  await clickPageDom(6);
  await hoverTarget('朱鹏旭');
  const ar = await html();
  fs.writeFileSync(path.join(OUT, '23-aaron-html.json'), JSON.stringify(ar, null, 1), 'utf8');
  log('AR_LISTS', ar.lists ? ar.lists.length : 0);
  (ar.lists || []).forEach(l => log('  LIST', l.cls.slice(0, 60), l.inner.slice(0, 600)));
  log('AR_TAGS', ar.tags ? ar.tags.length : 0);
  (ar.tags || []).forEach(t => log('  TAG', t.cls.slice(0, 50), 't=' + t.t.slice(0, 30), t.inner.slice(0, 250)));

  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
