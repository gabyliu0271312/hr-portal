/* 360°评估率 tooltip 提炼 - 29: 催办按钮完整 DOM（复制27成功路径）+ 点击抓请求
 * 用法：node capture-rate-tooltip-29-remind4.js
 * 产出：out/rate-tooltip/29-remind4.json
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
      apiResp.push({ u: u.slice(0, 260), st: res.status(), body: body.slice(0, 40000) });
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
  const diag = await page.evaluate(() => { const cur = document.querySelector('.ud__pagination-item-active'); return cur ? (cur.textContent || '').trim() : '?'; });
  log('PAGE', diag);

  // hover 360°cell（朱鹏旭 1/2）
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr,[class*=table-row],[class*=Row]')].find(rr => (rr.textContent || '').includes('朱鹏旭') && rr.getBoundingClientRect().height > 30);
    if (row) row.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(1000);
  const pt = await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr,[class*=table-row],[class*=Row]')].find(rr => (rr.textContent || '').includes('朱鹏旭') && rr.getBoundingClientRect().height > 30);
    if (!row) return null;
    const cell = [...row.querySelectorAll('td,[class*=cell]')].find(c => { const rr = c.getBoundingClientRect(); return rr.width > 0 && rr.height > 10 && rr.x > 2240 && rr.x < 2700; });
    if (!cell) return null;
    const rr = cell.getBoundingClientRect();
    return { x: +(rr.x + 30).toFixed(1), y: +(rr.y + rr.height / 2).toFixed(1) };
  });
  log('CELL_PT', JSON.stringify(pt));
  if (!pt) { log('no cell'); process.exit(0); }
  await page.mouse.move(pt.x, pt.y, { steps: 8 });
  await page.waitForTimeout(6000);

  // 找未评估 person 标签并移上去（保持弹窗 + 触发催办渲染）
  const tagPt = await page.evaluate(() => {
    const pop = document.querySelector('.ud__popover.EvaluateRatio-popover');
    if (!pop) return null;
    const leaf = [...pop.querySelectorAll('*')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (el.textContent || '').trim().includes('张宏宇'); }).pop();
    if (!leaf) return null;
    const r = leaf.getBoundingClientRect();
    return { x: +(r.x + r.width / 2).toFixed(1), y: +(r.y + r.height / 2).toFixed(1) };
  });
  log('TAG_PT', JSON.stringify(tagPt));
  if (!tagPt) { log('no tag in popover'); process.exit(0); }
  await page.mouse.move(tagPt.x, tagPt.y, { steps: 5 });
  await page.waitForTimeout(3000);

  const probe = await page.evaluate(() => {
    const pop = document.querySelector('.ud__popover.EvaluateRatio-popover');
    if (!pop) return { err: 'no popover' };
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +(r.x).toFixed(1), y: +(r.y).toFixed(1), w: +(r.width).toFixed(1), h: +(r.height).toFixed(1) }; };
    const cs = el => { const c = getComputedStyle(el); return { bg: c.backgroundColor, c: c.color, fs: c.fontSize, fw: c.fontWeight, br: c.borderRadius, pd: c.padding, bd: c.border, f: c.fontFamily.slice(0, 40), lh: c.lineHeight }; };
    // walk 找「催办」叶子
    const remindEls = [];
    const walk = (el, depth) => {
      if (depth > 10) return;
      const t = (el.textContent || '').trim();
      if (t === '催办' || (t.includes('催办') && t.length < 12)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) remindEls.push({ depth, tag: el.tagName, cls: (el.className || '').toString().slice(0, 80), ...rect(el), cs: cs(el), inner: el.outerHTML.replace(/\s+/g, ' ').slice(0, 600) });
      }
      [...el.children].forEach(c => walk(c, depth + 1));
    };
    walk(pop, 0);
    // 最深催办叶子的祖先链
    const ancestors = [];
    const leaf = (() => {
      const it = document.createTreeWalker(pop, NodeFilter.SHOW_TEXT);
      let n; while ((n = it.nextNode())) { if ((n.textContent || '').trim() === '催办') return n.parentElement; }
      return null;
    })();
    if (leaf) {
      let el = leaf.parentElement; let d = 0;
      while (el && el !== pop && d < 6) {
        ancestors.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 80), ...rect(el), cs: cs(el), inner: el.outerHTML.replace(/\s+/g, ' ').slice(0, 800) });
        el = el.parentElement; d++;
      }
    }
    // 未评估 block 完整 innerHTML
    const unevalBlock = [...pop.querySelectorAll('[class*=EmpLabelList]')].filter(l => (l.textContent || '').includes('未评估')).map(l => ({ cls: (l.className || '').toString().slice(0, 80), inner: l.innerHTML.replace(/\s+/g, ' ').slice(0, 4000) }));
    return { err: null, remindEls, ancestors, unevalBlock, popText: (pop.textContent || '').trim().slice(0, 120) };
  });
  fs.writeFileSync(path.join(OUT, '29-remind4.json'), JSON.stringify(probe, null, 1), 'utf8');
  log('ERR', probe.err, 'REMIND_ELS', probe.remindEls ? probe.remindEls.length : 0, 'ANC', probe.ancestors ? probe.ancestors.length : 0);
  log('POP_TEXT', probe.popText);
  (probe.remindEls || []).forEach(r => log('  REM', 'd' + r.depth, r.tag, r.cls.slice(0, 50), JSON.stringify({x: r.x, y: r.y, w: r.w, h: r.h}), JSON.stringify(r.cs), r.inner.slice(0, 400)));
  (probe.ancestors || []).forEach(a => log('  ANC', a.tag, a.cls.slice(0, 50), JSON.stringify({x: a.x, y: a.y, w: a.w, h: a.h}), a.inner.slice(0, 400)));
  (probe.unevalBlock || []).forEach(u => log('  UL', u.cls.slice(0, 50), u.inner.slice(0, 2000)));

  await page.screenshot({ path: path.join(OUT, '29-remind4.png') }).catch(() => {});

  // 点击催办 → 抓请求与 UI
  if (probe.remindEls && probe.remindEls.length) {
    apiResp.length = 0;
    const target = probe.remindEls[0];
    log('CLICK_REMIND', target.x, target.y);
    await page.mouse.click(target.x + target.w / 2, target.y + target.h / 2);
    await page.waitForTimeout(3500);
    log('---API after remind click---');
    apiResp.filter(a => /remind|notify|urge|message|im|push/i.test(a.u)).forEach(a => log('  ', a.st, a.u.replace('https://idreamsky.feishu.cn', ''), (a.body || '').slice(0, 300)));
    const after = await page.evaluate(() => {
      const pop = document.querySelector('.ud__popover.EvaluateRatio-popover');
      const popT = pop ? (pop.textContent || '').trim() : '';
      const modal = [...document.querySelectorAll('[class*=Modal],[class*=modal],[class*=Dialog],[class*=dialog]')].filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0).map(el => ({ cls: (el.className || '').toString().slice(0, 60), t: (el.textContent || '').trim().slice(0, 120) })).slice(0, 6);
      const toast = [...document.querySelectorAll('[class*=toast],[class*=Toast],[class*=message],[class*=Message],[class*=notification],[class*=Notification]')].filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0).map(el => ({ cls: (el.className || '').toString().slice(0, 60), t: (el.textContent || '').trim().slice(0, 120) })).slice(0, 6);
      return { popText: popT.slice(0, 150), modal, toast };
    });
    log('AFTER_CLICK', JSON.stringify(after, null, 1).slice(0, 2000));
  }
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
