/* REA 抓取 7c：删除确认弹窗完整结构 + 取消
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
  const dump = await page.evaluate(() => {
    const wrap = [...document.querySelectorAll('.perf-web__ud__dialog__wrap')].find(el => (el.textContent || '').includes('确定删除') && el.getBoundingClientRect().width > 0);
    if (!wrap) return { found: false };
    const content = [...wrap.querySelectorAll('.perf-web__ud__dialog__content')][0] || wrap;
    const lines = [];
    const walk = (el, depth) => {
      if (depth > 4) return;
      const rr = el.getBoundingClientRect();
      if (rr.width <= 0 && rr.height <= 0 && depth > 0) return;
      const cs = getComputedStyle(el);
      lines.push({ d: depth, tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 90), t: (el.textContent || '').trim().slice(0, 30), x: +rr.x.toFixed(0), y: +rr.y.toFixed(0), w: +rr.width.toFixed(0), h: +rr.height.toFixed(0), st: { bg: cs.backgroundColor, c: cs.color, fs: cs.fontSize, fw: cs.fontWeight, radius: cs.borderRadius } });
      [...el.children].slice(0, 16).forEach(k => walk(k, depth + 1));
    };
    walk(content, 0);
    const btns = [...content.querySelectorAll('button')].filter(el => (el.textContent || '').trim() && el.getBoundingClientRect().width > 0).map(el => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { t: (el.textContent || '').trim().slice(0, 10), x: +r.x.toFixed(0), y: +r.y.toFixed(0), w: +r.width.toFixed(0), h: +r.height.toFixed(0), cls: (el.className || '').toString().slice(0, 60), bg: cs.backgroundColor, c: cs.color, border: cs.borderColor, disabled: el.disabled };
    });
    return { found: true, lines, btns };
  });
  fs.writeFileSync(path.join(OUT, '29-delete-dialog.json'), JSON.stringify(dump, null, 2), 'utf8');
  log('DELETE_LINES', JSON.stringify((dump.lines || []).filter(l => l.t).slice(0, 16)));
  log('DELETE_BTNS', JSON.stringify(dump.btns));
  try { await page.screenshot({ path: path.join(OUT, '30-delete-dialog.png'), animations: 'disabled', timeout: 10000 }); log('SHOT ok'); } catch (e) { log('SHOT fail', e.message.slice(0, 50)); }
  // 取消（不真删）
  const canceled = await page.evaluate(() => {
    const wrap = [...document.querySelectorAll('.perf-web__ud__dialog__wrap')].find(el => (el.textContent || '').includes('确定删除') && el.getBoundingClientRect().width > 0);
    const btn = wrap && [...wrap.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '取消');
    if (btn) { btn.click(); return true; }
    return false;
  });
  log('CANCEL_DELETE', canceled);
  await page.waitForTimeout(800);
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
