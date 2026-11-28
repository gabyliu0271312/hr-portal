process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('feishu.cn'));
  if (!page) return;
  await page.goto('https://idreamsky.feishu.cn/perf/admin/permission/role-setting/list/review-role', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2200);
  console.log('URL', page.url());
  const s = await page.evaluate(() => {
    const rows = [];
    const tds = [...document.querySelectorAll('.perf-web__ud__table-cell-fix-right')].filter(td => td.getBoundingClientRect().width > 0);
    tds.forEach((td, i) => {
      const btns = [...td.querySelectorAll('button')].filter(b => (b.textContent || '').trim()).map(b => (b.textContent || '').trim().slice(0, 6) + (b.disabled ? '(d)' : ''));
      const moreDiv = [...td.querySelectorAll('div')].find(d => d.getBoundingClientRect().width === 24 && d.getBoundingClientRect().height === 24 && getComputedStyle(d).cursor === 'pointer');
      const firstCellText = (() => {
        const cell = td.closest('tr') || td.parentElement;
        return (cell && cell.textContent ? cell.textContent.trim().slice(0, 14) : '');
      })();
      rows.push({ i, btns, hasMore: !!moreDiv, row: firstCellText });
    });
    return rows;
  });
  console.log(JSON.stringify(s));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
