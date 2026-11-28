process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'out', 'role-add-dialog');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('feishu.cn'));
  if (!page) { console.log('NO_PAGE'); return; }
  const s = await page.evaluate(() => {
    // 所有固定定位的大容器（弹窗/确认）
    const boxes = [...document.querySelectorAll('div')].filter(el => {
      const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
      return (cs.position === 'fixed' || cs.position === 'absolute') && r.width > 200 && r.height > 100;
    }).map(el => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { cls: (el.className || '').toString().slice(0, 90), x: +r.x.toFixed(0), y: +r.y.toFixed(0), w: +r.width.toFixed(0), h: +r.height.toFixed(0), t: (el.textContent || '').trim().slice(0, 60), z: cs.zIndex, bg: cs.backgroundColor };
    }).filter(b => b.t).slice(0, 12);
    return boxes;
  });
  console.log(JSON.stringify(s, null, 1));
  try { await page.screenshot({ path: path.join(OUT, '30b-delete-state.png'), timeout: 8000 }); console.log('SHOT ok'); } catch (e) { console.log('SHOT fail', e.message.slice(0, 60)); }
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
