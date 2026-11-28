process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('feishu.cn'));
  if (!page) { console.log('NO_PAGE'); return; }
  console.log('URL', page.url());
  const info = await page.evaluate(() => {
    const rows = [];
    document.querySelectorAll('[class*=table] tr, [class*=table] [class*=row]').forEach((el, i) => {
      const t = (el.textContent || '').trim();
      if (t && t.length < 120 && el.getBoundingClientRect().width > 0 && (t.includes('编辑') || t.includes('停用') || t.includes('复制') || t.includes('删除') || t.includes('评估角色') || t.includes('被评估人'))) {
        rows.push({ i, t: t.slice(0, 100), x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y });
      }
    });
    const allBtns = [...document.querySelectorAll('button')].filter(el => el.getBoundingClientRect().width > 0 && (el.textContent || '').trim()).map(el => ({
      t: (el.textContent || '').trim().slice(0, 14), x: +el.getBoundingClientRect().x.toFixed(0), y: +el.getBoundingClientRect().y.toFixed(0),
      disabled: el.disabled, cls: (el.className || '').toString().slice(0, 60),
    }));
    return { rows, allBtns };
  });
  console.log('BTNS', JSON.stringify(info.allBtns));
  console.log('ROWS', JSON.stringify(info.rows));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
