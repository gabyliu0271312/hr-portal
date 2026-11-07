/* REA 编辑链路采集 7：导航到周期版管理页 → 找周期版编辑入口
 * 周期 7654423719619710195，tab=semester
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
    if (/\/focus-people\/|activity-focus-people\//.test(p.url())) page = p;
  }
  if (!page) { log('NO_PAGE'); await browser.close().catch(() => {}); process.exit(2); }
  log('current URL:', page.url());

  // 导航到周期版管理页列表（tab=semester）
  await page.goto('https://idreamsky.feishu.cn/perf/admin/semester-activities/7654423719619710195/focus-people?tab=semester&current=1&size=10', { waitUntil: 'networkidle', timeout: 30000 }).catch(e => log('goto err', e.message));
  await page.waitForTimeout(1500);
  log('nav URL:', page.url());

  // 列表文本（看有哪些组）
  const txt = await page.evaluate(() => document.body.innerText);
  const lines = txt.split('\n').map(s => s.trim()).filter(s => s);
  log('LIST_TEXT:');
  lines.slice(0, 50).forEach((l, i) => console.log('  ', i, JSON.stringify(l.slice(0, 60))));

  // 找编辑/操作按钮
  const actions = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, [class*="action"], [class*="link"]'))
      .map(el => ({ txt: (el.innerText || '').trim().slice(0, 16), cls: String(el.className).slice(0, 60), rect: (() => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })() }))
      .filter(x => x.rect[2] > 0 && (x.txt.includes('编辑') || x.txt.includes('新建') || x.txt.includes('删除') || x.txt.includes('更多')));
  });
  log('ACTIONS:', JSON.stringify(actions, null, 1).slice(0, 1800));

  await page.screenshot({ path: path.join(OUT, 'semester-list.png') }).catch(e => log('shot err', e.message));
  log('DONE');
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
