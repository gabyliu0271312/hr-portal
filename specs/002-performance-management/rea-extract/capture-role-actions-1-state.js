process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('feishu.cn'));
  if (!page) { console.log('NO_PAGE'); return; }
  console.log('URL', page.url());
  const s = await page.evaluate(() => {
    const modalOpen = !!document.querySelector('.perf-web__ud__modal__content') && document.querySelector('.perf-web__ud__modal__content').getBoundingClientRect().width > 0;
    const modalText = modalOpen ? document.querySelector('.perf-web__ud__modal__content').textContent.trim().slice(0, 120) : '';
    // 更多按钮(三点)候选：操作列的无文字 icon 按钮
    const actionBtns = [...document.querySelectorAll('button')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.x > 2900 && r.y > 300;
    }).map(el => ({ t: (el.textContent || '').trim().slice(0, 8), x: +el.getBoundingClientRect().x.toFixed(0), y: +el.getBoundingClientRect().y.toFixed(0), w: +el.getBoundingClientRect().width.toFixed(0), h: +el.getBoundingClientRect().height.toFixed(0), cls: (el.className || '').toString().slice(0, 70), disabled: el.disabled }));
    return { modalOpen, modalText, actionBtns };
  });
  console.log(JSON.stringify(s, null, 1));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
