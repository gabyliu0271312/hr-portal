/* 模板预览右栏左对齐几何校验：块标题 / 字段名 / 富文本编辑器盒 左缘是否一致（REA x=1021）
 * 用法：先起 vite dev，再 node check-align.js
 */
process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 950 } });
  await page.goto('http://localhost:5173/verify-preview.html', { waitUntil: 'networkidle', timeout: 60000 }).catch(e => {
    console.log('HARNESS_ERR', String(e.message || e).slice(0, 200));
  });
  await page.waitForTimeout(2000);

  const geo = await page.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
    const out = {};
    const title = [...document.querySelectorAll('.ptp-block__title')].find(e => (e.textContent || '').trim() === '工作总结');
    const field = [...document.querySelectorAll('.template-field-label')].find(e => (e.textContent || '').includes('重点工作'));
    const editor = [...document.querySelectorAll('.performance-rich-text-box')].filter(e => e.getBoundingClientRect().width > 100).sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y)[0];
    const ratingTitle = [...document.querySelectorAll('.ptp-block__title')].find(e => (e.textContent || '').trim() === '综合评级');
    const renderer = document.querySelector('.performance-template-renderer');
    out.blockTitle = title ? r(title) : null;
    out.fieldLabel = field ? r(field) : null;
    out.editorBox = editor ? r(editor) : null;
    out.ratingTitle = ratingTitle ? r(ratingTitle) : null;
    out.renderer = renderer ? { ...r(renderer), padLeft: getComputedStyle(renderer).paddingLeft, padRight: getComputedStyle(renderer).paddingRight } : null;
    out.body = (() => { const b = document.querySelector('.ptp-body--fill'); return b ? r(b) : null; })();
    return out;
  });
  console.log(JSON.stringify(geo, null, 1));

  // 断言：左缘一致（容差 1px）
  const a = geo.blockTitle, f = geo.fieldLabel, e = geo.editorBox;
  if (!a || !f || !e) { console.log('MISSING_NODES'); await browser.close(); return; }
  const ok = Math.abs(a.x - f.x) <= 1 && Math.abs(a.x - e.x) <= 1;
  console.log('LEFT_EDGE_ALIGNED', ok, { title: a.x, field: f.x, editor: e.x });
  console.log('EDITOR_WIDTH', e.w, 'BLOCK_TITLE_W', a.w);
  console.log('RENDERER_PADDING', geo.renderer && geo.renderer.padLeft, geo.renderer && geo.renderer.padRight);
  await browser.close();
})();
