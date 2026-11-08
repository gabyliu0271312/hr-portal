/* 360°评估率 tooltip 提炼 - 26: aaron 未评估 person 标签完整 HTML + 催办交互探测
 * 用法：node capture-rate-tooltip-26-remind2.js
 * 产出：out/rate-tooltip/26-aaron-tags.json
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
    await page.waitForTimeout(6000);
    return true;
  }

  await clickPageDom(6);
  await hoverTarget('朱鹏旭');
  const out = await page.evaluate(() => {
    const pop = document.querySelector('.ud__popover.EvaluateRatio-popover');
    if (!pop) return { err: 'no popover' };
    // 抓 person 标签完整 outerHTML
    const tags = [...pop.querySelectorAll('ee-user-card, [class*=employee-label], [class*=EmpLabel], [class*=user-card]')].map(el => ({ cls: (el.className || '').toString().slice(0, 70), inner: el.outerHTML.replace(/\s+/g, ' ').slice(0, 1200), attrs: [...el.attributes].map(a => a.name + '=' + a.value) }));
    // 所有 button / 可点击
    const btns = [...pop.querySelectorAll('button,a,[role=button],[class*=btn],[class*=link],[class*=action]')].filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0).map(el => ({ tag: el.tagName, t: (el.textContent || '').trim().slice(0, 20), cls: (el.className || '').toString().slice(0, 60), x: +el.getBoundingClientRect().x.toFixed(0), y: +el.getBoundingClientRect().y.toFixed(0), w: +el.getBoundingClientRect().width.toFixed(0), h: +el.getBoundingClientRect().height.toFixed(0), inner: el.outerHTML.replace(/\s+/g, ' ').slice(0, 400) }));
    // 未评估区 loading 是否结束
    const loading = !!pop.querySelector('.ud__loading, [class*=spin-loading]');
    // 未评估区 innerHTML
    const uneval = [...pop.querySelectorAll('[class*=EmpLabelList]')].filter(l => (l.textContent || '').includes('未评估')).map(l => ({ cls: (l.className || '').toString().slice(0, 60), inner: l.innerHTML.replace(/\s+/g, ' ').slice(0, 2500) }));
    return { tags, btns, loading, uneval };
  });
  fs.writeFileSync(path.join(OUT, '26-aaron-tags.json'), JSON.stringify(out, null, 1), 'utf8');
  log('TAGS', out.tags ? out.tags.length : 0);
  (out.tags || []).forEach(t => log('  TAG', t.cls.slice(0, 50), t.inner.slice(0, 250), t.attrs.join(' ')));
  log('BTNS', out.btns ? out.btns.length : 0);
  (out.btns || []).forEach(b => log('  BTN', b.tag, b.t, b.x, b.y, b.w + 'x' + b.h, b.cls.slice(0, 40), b.inner.slice(0, 120)));
  log('LOADING', out.loading);
  log('UNEVAL_LIST', out.uneval ? out.uneval.length : 0);
  (out.uneval || []).forEach(u => log('  UL', u.cls.slice(0, 50), u.inner.slice(0, 600)));
  log('---API---');
  apiResp.forEach(a => log('  ', a.st, a.u.replace('https://idreamsky.feishu.cn', ''), (a.body || '').slice(0, 80)));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
