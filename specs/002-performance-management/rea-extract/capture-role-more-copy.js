/* REA 抓取 6：自定义评估角色「…」下拉 + 「复制」弹窗
 * 用法: node capture-role-more-copy.js
 */
process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'out', 'role-add-dialog');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('feishu.cn'));
  if (!page) throw new Error('no feishu page');

  // 1) 点击第1行「…」
  const clicked = await page.evaluate(() => {
    const div = [...document.querySelectorAll('div')].find(el => {
      const r = el.getBoundingClientRect();
      return r.width === 24 && r.height === 24 && r.y >= 330 && r.y <= 380 && getComputedStyle(el).cursor === 'pointer';
    });
    if (!div) return false;
    div.click();
    return true;
  });
  log('CLICK_MORE', clicked);
  await page.waitForTimeout(1200);

  // 2) 采集下拉
  const dropdown = await page.evaluate(() => {
    const items = [...document.querySelectorAll('[class*=dropdown] [class*=menu] [class*=item], [class*=popover] [class*=item], [class*=menu] [class*=item]')].filter(el => {
      const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (el.textContent || '').trim();
    }).map(el => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { t: (el.textContent || '').trim().slice(0, 14), x: +r.x.toFixed(0), y: +r.y.toFixed(0), w: +r.width.toFixed(0), h: +r.height.toFixed(0), cls: (el.className || '').toString().slice(0, 70), bg: cs.backgroundColor, c: cs.color, disabled: el.getAttribute('aria-disabled') === 'true' };
    });
    return items;
  });
  fs.writeFileSync(path.join(OUT, '25-more-dropdown.json'), JSON.stringify(dropdown, null, 2), 'utf8');
  await page.screenshot({ path: path.join(OUT, '26-more-dropdown.png') });
  log('DROPDOWN', JSON.stringify(dropdown));

  // 3) 点「复制」
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(el => (el.textContent || '').trim() === '复制' && el.getBoundingClientRect().width > 0 && el.children.length === 0);
    if (el) el.closest('[class*=item], [role=menuitem], button, li, div')?.click();
  });
  await page.waitForTimeout(1500);

  // 4) 采集复制弹窗
  const dlg = await page.evaluate(() => {
    const box = [...document.querySelectorAll('.perf-web__ud__modal__content')].find(el => el.getBoundingClientRect().width > 0);
    if (!box) return { found: false };
    const r = box.getBoundingClientRect();
    const lines = [];
    const walk = (el, depth) => {
      if (depth > 3) return;
      const rr = el.getBoundingClientRect();
      if (rr.width <= 0 && rr.height <= 0 && depth > 0) return;
      lines.push({ d: depth, tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 90), t: (el.textContent || '').trim().slice(0, 26), x: +rr.x.toFixed(0), y: +rr.y.toFixed(0), w: +rr.width.toFixed(0), h: +rr.height.toFixed(0) });
      [...el.children].slice(0, 16).forEach(k => walk(k, depth + 1));
    };
    walk(box, 0);
    const inputs = [...box.querySelectorAll('input,textarea')].filter(el => { const rr = el.getBoundingClientRect(); return rr.width > 0 && rr.height > 0; }).map(el => ({ tag: el.tagName, ph: (el.placeholder || '').slice(0, 20), val: (el.value || '').slice(0, 40), x: +el.getBoundingClientRect().x.toFixed(0), y: +el.getBoundingClientRect().y.toFixed(0) }));
    const btns = [...box.querySelectorAll('button')].filter(el => (el.textContent || '').trim() && el.getBoundingClientRect().width > 0).map(el => ({ t: (el.textContent || '').trim().slice(0, 12), cls: (el.className || '').toString().slice(0, 55), disabled: el.disabled }));
    return { found: true, boxRect: { x: r.x, y: r.y, w: r.width, h: r.height }, lines, inputs, btns };
  });
  fs.writeFileSync(path.join(OUT, '27-copy-dialog.json'), JSON.stringify(dlg, null, 2), 'utf8');
  await page.screenshot({ path: path.join(OUT, '28-copy-dialog.png') });
  log('COPY_DLG', dlg.found, JSON.stringify(dlg.boxRect), 'inputs', JSON.stringify(dlg.inputs), 'btns', JSON.stringify(dlg.btns));
  log('COPY_LINES', JSON.stringify((dlg.lines || []).filter(l => l.t).slice(0, 14)));

  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
