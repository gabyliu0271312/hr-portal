/* 360°评估率 tooltip 提炼 - 04: 诊断 hover 浮层（MutationObserver）+ 工具栏定位
 * 用法：node capture-rate-tooltip-04-diag.js
 * 产出：out/rate-tooltip/04-diag.json / 04-hover-observe.json
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

  // 1) 工具栏区域 (y 150-270) 元素诊断
  const toolbar = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const els = [...document.querySelectorAll('input,button,[class*=search],[class*=Search],[class*=filter],[class*=Filter],[class*=toolbar],[class*=Toolbar],[class*=header],[class*=action],div,span')]
      .filter(el => { const rr = el.getBoundingClientRect(); return rr.y >= 150 && rr.y <= 275 && rr.width > 0 && rr.height > 0 && rr.width < 400; })
      .map(el => ({ tag: el.tagName, t: (el.textContent || '').trim().slice(0, 24), ...rect(el), cls: (el.className || '').toString().slice(0, 70), ph: el.placeholder || '', aria: el.getAttribute('aria-label') || '', role: el.getAttribute('role') || '' }))
      .filter(x => x.t || x.ph || x.aria || x.role || /search|filter|toolbar/i.test(x.cls));
    return els;
  });
  fs.writeFileSync(path.join(OUT, '04-toolbar.json'), JSON.stringify(toolbar, null, 1), 'utf8');
  log('TOOLBAR_ELS', toolbar.length);
  toolbar.forEach(el => log('  TE', el.tag, el.t, el.x, el.y, el.w, el.h, el.cls.slice(0, 40)));

  // 2) 注入 MutationObserver：记录 hover 期间新出现的浮层
  await page.evaluate(() => {
    window.__hoverLog = [];
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          const el = n;
          const cls = (el.className || '').toString();
          const cs = getComputedStyle(el);
          if (['fixed', 'absolute'].includes(cs.position) || /popup|tooltip|popover|float|hover/i.test(cls)) {
            window.__hoverLog.push({ at: Date.now(), tag: el.tagName, cls: cls.slice(0, 80), pos: cs.position, text: (el.textContent || '').slice(0, 60) });
          }
          // 也记录子级新增
          const subs = [...el.querySelectorAll('*')].filter(s => { const c = getComputedStyle(s); return ['fixed', 'absolute'].includes(c.position) && (s.getBoundingClientRect().width > 80); }).map(s => ({ tag: s.tagName, cls: (s.className || '').toString().slice(0, 80), pos: getComputedStyle(s).position, text: (s.textContent || '').slice(0, 60) }));
          for (const s of subs) window.__hoverLog.push({ at: Date.now(), ...s });
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    window.__obs = obs;
  });

  // 3) 在首行 360°评估率 cell 上 hover（先不搜索，用第一行肖惠方）
  const pt = await page.evaluate(() => {
    const cell = [...document.querySelectorAll('td,[class*=cell]')].find(el => {
      const rr = el.getBoundingClientRect();
      return rr.width > 0 && rr.height > 10 && rr.x > 2240 && rr.x < 2700 && rr.y > 300 && rr.y < 360;
    });
    if (!cell) return null;
    const rr = cell.getBoundingClientRect();
    return { x: +(rr.x + 30).toFixed(1), y: +(rr.y + rr.height / 2).toFixed(1) };
  });
  log('HOVER_PT', JSON.stringify(pt));
  if (pt) {
    await page.mouse.move(pt.x, pt.y, { steps: 8 });
    await page.waitForTimeout(2500);
  }
  const hoverLog = await page.evaluate(() => window.__hoverLog || []);
  log('HOVER_LOG_ENTRIES', hoverLog.length);
  hoverLog.forEach(h => log('  HL', h.tag, h.cls.slice(0, 50), h.pos, 'text:', (h.text || '').slice(0, 50)));

  // 4) hover 后抓当前可见浮层
  const layers = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const cs = el => { const c = getComputedStyle(el); return { pos: c.position, z: c.zIndex, bg: c.backgroundColor, shadow: c.boxShadow, br: c.borderRadius, bd: c.border }; };
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const rr = el.getBoundingClientRect();
      const c = getComputedStyle(el);
      if (rr.width > 80 && rr.width < 800 && rr.height > 30 && rr.height < 700 && (c.position === 'fixed' || c.position === 'absolute') && c.zIndex >= 100) {
        out.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 90), ...rect(el), ...cs(el), text: (el.textContent || '').trim().slice(0, 200) });
      }
    }
    return out;
  });
  fs.writeFileSync(path.join(OUT, '04-hover-layers.json'), JSON.stringify(layers, null, 1), 'utf8');
  log('VISIBLE_LAYERS', layers.length);
  layers.forEach(l => log('  LAY', l.tag, l.cls.slice(0, 50), l.x, l.y, l.w, l.h, 'z', l.z, 'text:', l.text.slice(0, 60)));
  await page.screenshot({ path: path.join(OUT, '04-hover.png') });

  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
