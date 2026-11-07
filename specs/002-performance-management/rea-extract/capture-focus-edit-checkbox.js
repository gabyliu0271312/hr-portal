/* REA 编辑链路采集 5：checkbox 方块精确点击确认（项目版编辑表单）
 * 点 checkbox 方块本体（16×16），确认能否勾选 + 勾选后保存 payload 变化
 */
process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out', 'focus-edit');
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctxs = browser.contexts();
  let page = null;
  for (const ctx of ctxs) for (const p of ctx.pages()) {
    if (/\/activity-focus-people\/[0-9]+/.test(p.url())) page = p;
  }
  if (!page) { log('NO_EDIT_PAGE'); await browser.close().catch(() => {}); process.exit(2); }
  await page.waitForTimeout(500);

  // 点第一个 checkbox 方块（256,608,16,16 → 中心 264,616）
  const box = await page.evaluate(() => {
    const cb = document.querySelector('.ud__checkbox__input');
    if (!cb) return null;
    const r = cb.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
  });
  log('checkbox input rect:', JSON.stringify(box));
  if (box) {
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.ud__checkbox__wrapper')).map(c => ({
        text: (c.innerText || '').trim().slice(0, 18),
        checked: !!(c.querySelector('.ud__checkbox__input') && c.querySelector('.ud__checkbox__input').checked)
      }));
    });
    log('after square click:', JSON.stringify(after));
    fs.writeFileSync(path.join(OUT, 'checkbox-after-click.json'), JSON.stringify(after, null, 1), 'utf8');
  }

  // 截图当前表单
  await page.screenshot({ path: path.join(OUT, 'edit-checkbox-toggled.png') }).catch(e => log('shot err', e.message));
  log('DONE');
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
