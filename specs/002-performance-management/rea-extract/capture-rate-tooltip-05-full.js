/* 360°评估率 tooltip 提炼 - 05: 完整抓取三种弹窗态 + 催办确认弹窗
 * 用法：node capture-rate-tooltip-05-full.js
 * 产出：out/rate-tooltip/05-alice.json / 05-aaron.json / 05-huixiang.json
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

  const fullPopup = () => page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const cs = el => { const c = getComputedStyle(el); return { display: c.display, pos: c.position, z: c.zIndex, bg: c.backgroundColor, c: c.color, fs: c.fontSize, fw: c.fontWeight, lh: c.lineHeight, br: c.borderRadius, bd: c.border, shadow: c.boxShadow, pd: c.padding, mg: c.margin, ff: c.fontFamily }; };
    const pop = document.querySelector('.ud__popover.EvaluateRatio-popover');
    if (!pop) return { err: 'no popover' };
    const pr = pop.getBoundingClientRect();
    const walk = (el, depth) => {
      if (depth > 5) return null;
      const rr = el.getBoundingClientRect();
      const kids = [...el.children].map(ch => walk(ch, depth + 1)).filter(Boolean);
      return {
        tag: el.tagName,
        cls: (el.className || '').toString().slice(0, 80),
        ...rect(el),
        cs: cs(el),
        text: (el.textContent || '').trim().slice(0, 150),
        children: kids.slice(0, 30),
      };
    };
    // 只抓 pop 内的（排除全屏 app 外层）
    const tree = walk(pop, 0);
    // 按钮（含催办）
    const btns = [...pop.querySelectorAll('button, [role=button], [class*=btn]')].filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0).map(el => {
      const rr = el.getBoundingClientRect();
      return { t: (el.textContent || '').trim().slice(0, 20), ...rect(el), cs: cs(el), cls: (el.className || '').toString().slice(0, 60) };
    });
    // 图标
    const icons = [...pop.querySelectorAll('svg,[class*=icon],[class*=Icon]')].filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().width < 30).map(el => ({ cls: (el.className || '').toString().slice(0, 50), ...rect(el), svg: el.tagName === 'svg' ? el.outerHTML.slice(0, 200) : '' }));
    return { rect: { x: +pr.x.toFixed(1), y: +pr.y.toFixed(1), w: +pr.width.toFixed(1), h: +pr.height.toFixed(1) }, cs: cs(pop), tree, btns, icons };
  });

  async function searchAndHover(name, rowText) {
    // 点搜索框 (x~313,y~192)
    await page.mouse.click(313, 192);
    await page.waitForTimeout(400);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(name, { delay: 40 });
    await page.waitForTimeout(1800);
    // 确认出现该行
    const found = await page.evaluate((rowText) => [...document.querySelectorAll('tr,[class*=table-row],[class*=Row]')].some(r => (r.textContent || '').includes(rowText) && r.getBoundingClientRect().height > 30), rowText);
    log('FOUND_ROW', rowText, found);
    if (!found) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); return null; }
    // hover 360°cell
    const pt = await page.evaluate((rowText) => {
      for (const el of [...document.querySelectorAll('tr,[class*=table-row],[class*=Row]')]) {
        if (!(el.textContent || '').includes(rowText) || el.getBoundingClientRect().height < 30) continue;
        const cells = [...el.querySelectorAll('td,[class*=cell]')].filter(c => { const rr = c.getBoundingClientRect(); return rr.width > 0 && rr.height > 10 && rr.x > 2240 && rr.x < 2700; });
        if (cells.length) { const rr = cells[0].getBoundingClientRect(); return { x: +(rr.x + 30).toFixed(1), y: +(rr.y + rr.height / 2).toFixed(1) }; }
      }
      return null;
    }, rowText);
    log('HOVER_PT', rowText, JSON.stringify(pt));
    if (!pt) return null;
    await page.mouse.move(pt.x, pt.y, { steps: 8 });
    await page.waitForTimeout(2000);
    return await fullPopup();
  }

  // ---- 1. aaron.zhu 朱鹏旭 (1/2: 已评估1 未评估1 催办) ----
  const aaron = await searchAndHover('朱鹏旭', '朱鹏旭');
  log('AARON_POPUP?', !!aaron && !aaron.err);
  if (aaron && !aaron.err) {
    fs.writeFileSync(path.join(OUT, '05-aaron.json'), JSON.stringify(aaron, null, 1), 'utf8');
    await page.screenshot({ path: path.join(OUT, '05-aaron.png') });
    log('AARON rect', JSON.stringify(aaron.rect), 'btns', aaron.btns.map(b => b.t));
  } else log('AARON err', JSON.stringify(aaron));

  // ---- 2. huixiang.chen 陈慧祥 (0/1: 未评估1 离职说明) ----
  await page.mouse.move(1400, 120);
  await page.waitForTimeout(800);
  const hx = await searchAndHover('陈慧祥', '陈慧祥');
  log('HX_POPUP?', !!hx && !hx.err);
  if (hx && !hx.err) {
    fs.writeFileSync(path.join(OUT, '05-huixiang.json'), JSON.stringify(hx, null, 1), 'utf8');
    await page.screenshot({ path: path.join(OUT, '05-huixiang.png') });
    log('HX rect', JSON.stringify(hx.rect), 'btns', hx.btns.map(b => b.t));
  } else log('HX err', JSON.stringify(hx));

  fs.writeFileSync(path.join(OUT, '05-api.json'), JSON.stringify(apiResp, null, 1), 'utf8');
  log('API', apiResp.length);
  apiResp.filter(a => a.u.includes('report/v3')).forEach(a => log('  ', a.st, a.u.replace('https://idreamsky.feishu.cn', '')));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
