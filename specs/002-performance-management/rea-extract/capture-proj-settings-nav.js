/* REA 抓取 9：导航到 周期与项目 → 项目设置，采集类似复制/删除操作
 */
process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'out', 'role-add-dialog');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('feishu.cn'));
  if (!page) throw new Error('no feishu page');
  log('BEFORE', page.url());
  // 点左侧「周期与项目」
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(el => (el.textContent || '').trim() === '周期与项目' && el.getBoundingClientRect().width > 0 && el.children.length === 0);
    if (el) (el.closest('a') || el).click();
  });
  await page.waitForTimeout(2200);
  log('AFTER', page.url());
  const info = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    texts: [...document.querySelectorAll('*')].filter(el => {
      const r = el.getBoundingClientRect(); const t = (el.textContent || '').trim();
      return t && t.length < 30 && r.width > 0 && r.height > 0 && el.children.length === 0;
    }).map(el => ({ t: (el.textContent || '').trim(), x: +el.getBoundingClientRect().x.toFixed(0), y: +el.getBoundingClientRect().y.toFixed(0) })).slice(0, 60),
  }));
  fs.writeFileSync(path.join(OUT, '31-proj-settings-nav.json'), JSON.stringify(info, null, 2), 'utf8');
  log('TEXTS', JSON.stringify(info.texts));
  try { await page.screenshot({ path: path.join(OUT, '32-proj-settings.png'), timeout: 10000 }); log('SHOT ok'); } catch (e) { log('SHOT fail', e.message.slice(0, 50)); }
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
