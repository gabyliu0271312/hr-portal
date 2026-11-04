/* 副本截图验证: 列表页 / 更新人员信息弹窗 / 人员变更记录弹窗 */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const ctx = await chromium.launch({ headless: true });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1680, height: 950 });
  const file = 'file:///' + path.join(__dirname, 'replica', 'infolist-ops-replica.html').replace(/\\/g, '/');
  await page.goto(file);
  await page.waitForTimeout(800);
  const out = path.join(__dirname, 'out', 'replica-shots');
  require('fs').mkdirSync(out, { recursive: true });
  await page.screenshot({ path: path.join(out, 'r1-list.png') });
  await page.evaluate(() => openUpdate());
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, 'r2-update-modal.png') });
  await page.evaluate(() => closeUpdate());
  await page.evaluate(() => openRecord('6733065924942988813'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, 'r3-record-modal.png') });
  console.log('[done]');
  await ctx.close();
})().catch(e => { console.error(e); process.exit(1); });
