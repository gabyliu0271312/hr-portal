process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('feishu.cn'));
  if (!page) return;
  const s = await page.evaluate(() => {
    const wrap = [...document.querySelectorAll('.perf-web__ud__dialog__wrap')].find(el => el.getBoundingClientRect().width > 0);
    if (!wrap) return { open: false };
    const text = (wrap.textContent || '').trim().slice(0, 60);
    const btns = [...wrap.querySelectorAll('button')].map(b => (b.textContent || '').trim().slice(0, 8)).filter(Boolean);
    // 点「保留」关闭
    const keep = [...wrap.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '保留');
    if (keep) keep.click();
    return { open: true, text, btns };
  });
  console.log(JSON.stringify(s));
  await page.waitForTimeout(800);
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
