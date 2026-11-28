process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('feishu.cn'));
  if (!page) return;
  // 需要回到角色配置评估角色页
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(el => (el.textContent || '').trim() === '角色配置' && el.getBoundingClientRect().width > 0 && el.children.length === 0);
    if (el) (el.closest('a') || el).click();
  });
  await page.waitForTimeout(2000);
  console.log('URL', page.url());
  const s = await page.evaluate(() => {
    // 每行操作列是否有 sc-EhVdV（三点）和按钮集合
    const rows = [];
    const tds = [...document.querySelectorAll('.perf-web__ud__table-cell-fix-right')].filter(td => td.getBoundingClientRect().width > 0);
    tds.forEach((td, i) => {
      const btns = [...td.querySelectorAll('button')].filter(b => (b.textContent || '').trim()).map(b => (b.textContent || '').trim().slice(0, 6) + (b.disabled ? '(d)' : ''));
      const hasMore = !!td.querySelector('div.sc-EhVdV') || !!td.querySelector('.perf-web__ud__dropdown ~ div, [class*=dropdown]');
      const moreDiv = [...td.querySelectorAll('div')].find(d => d.getBoundingClientRect().width === 24 && d.getBoundingClientRect().height === 24 && getComputedStyle(d).cursor === 'pointer');
      rows.push({ i, btns, hasMore: !!moreDiv });
    });
    return rows;
  });
  console.log(JSON.stringify(s));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
