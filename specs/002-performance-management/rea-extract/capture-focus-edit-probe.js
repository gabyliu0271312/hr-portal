/* REA 编辑表单采集 probe：连接当前管理页，确认列表结构 + 编辑入口
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
    if (p.url().includes('/focus-people/management/')) page = p;
  }
  if (!page) { log('NO_MANAGEMENT_PAGE'); await browser.close().catch(() => {}); process.exit(2); }
  log('URL:', page.url());
  await page.waitForTimeout(800);

  const title = await page.title();
  const url = page.url();
  log('title:', title);

  // 全页文本，看列表/按钮
  const txt = await page.evaluate(() => document.body.innerText);
  const lines = txt.split('\n').map(s => s.trim()).filter(s => s);
  log('PAGE_TEXT_LINES:');
  lines.slice(0, 60).forEach((l, i) => console.log('  ', i, JSON.stringify(l.slice(0, 80))));

  // 找「编辑」按钮
  const editBtns = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, [class*="action"], [class*="link"], a'))
      .map(el => ({ txt: (el.innerText || '').trim().slice(0, 20), cls: String(el.className).slice(0, 80), rect: (() => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })() }))
      .filter(x => x.rect[2] > 0 && (x.txt.includes('编辑') || x.txt.includes('新建') || x.txt.includes('删除')));
  });
  log('ACTION_BUTTONS:', JSON.stringify(editBtns, null, 1).slice(0, 2000));

  await page.screenshot({ path: path.join(OUT, 'management-list.png') }).catch(e => log('shot err', e.message));
  log('DONE');
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
