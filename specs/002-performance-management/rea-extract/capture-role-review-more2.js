process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('feishu.cn'));
  if (!page) return;
  console.log('URL', page.url());
  const s = await page.evaluate(() => {
    // 所有行的操作列：找每一行的编辑/停用按钮和三点
    const rows = [];
    // 行 = 包含「编辑」按钮的 tr / 容器
    const containers = [...document.querySelectorAll('tr, [class*=table-row], [class*=row]:not([class*=menu])')].filter(el => (el.textContent || '').includes('编辑') && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height < 80);
    containers.forEach((tr, i) => {
      const r = tr.getBoundingClientRect();
      const btns = [...tr.querySelectorAll('button')].filter(b => (b.textContent || '').trim()).map(b => (b.textContent || '').trim().slice(0, 6) + (b.disabled ? '(d)' : ''));
      const moreDiv = [...tr.querySelectorAll('div')].find(d => d.getBoundingClientRect().width === 24 && d.getBoundingClientRect().height === 24 && getComputedStyle(d).cursor === 'pointer');
      rows.push({ i, y: +r.y.toFixed(0), btns, hasMore: !!moreDiv, text: (tr.textContent || '').trim().slice(0, 20) });
    });
    return rows;
  });
  console.log(JSON.stringify(s));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
