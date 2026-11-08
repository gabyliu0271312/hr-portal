/* 360°评估率 tooltip 提炼 - 13: 测试搜索成员框输入+回车 / 下拉选择
 * 用法：node capture-rate-tooltip-13-search3.js
 * 产出：out/rate-tooltip/13-search-result.json
 */
process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = 'https://idreamsky.feishu.cn/perf/management/v2/7654423719619710195/7340285661313974274/all-projects/members';
const OUT = path.join(__dirname, 'out', 'rate-tooltip');
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  let page = ctx.pages().find(p => p.url().includes('all-projects/members'));
  if (!page) page = ctx.pages().find(p => p.url().includes('feishu.cn'));

  const apiReq = [];
  page.on('request', req => {
    const u = req.url();
    if (u.includes('/perf/api/report/v3/semesters/') && /users\/list/.test(u)) {
      apiReq.push({ m: req.method(), u: u.slice(0, 240), pd: (req.postData() || '').slice(0, 3000) });
    }
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  let waited = 0;
  while (waited < 150) {
    const t = await page.evaluate(() => document.body.innerText || '');
    if (/成员列表|360°/.test(t) && t.length > 300) break;
    await page.waitForTimeout(3000); waited += 3;
  }
  await page.waitForTimeout(4000);
  log('LOADED');

  // 关闭筛选抽屉（如果还在）
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);

  // 点击搜索框
  await page.mouse.click(500, 200);
  await page.waitForTimeout(500);
  // 输入 朱鹏旭（拼音 zhu peng xu 或直接中文）
  await page.keyboard.type('朱鹏旭', { delay: 50 });
  await page.waitForTimeout(2000);
  // 抓输入后的页面：是否有下拉建议
  const afterType = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const act = document.activeElement;
    const val = act && act.tagName === 'INPUT' ? act.value : '';
    // 找可能的下拉
    const cands = [...document.querySelectorAll('*')].filter(el => {
      const rr = el.getBoundingClientRect();
      const c = getComputedStyle(el);
      if (rr.width < 150 || rr.width > 1000 || rr.height < 30) return false;
      if (!['absolute', 'fixed'].includes(c.position)) return false;
      const t = (el.textContent || '').trim();
      return t && (t.includes('朱鹏旭') || t.includes('aaron') || /加载|没有|无|暂未|搜索/.test(t));
    }).map(el => ({ cls: (el.className || '').toString().slice(0, 80), ...rect(el), text: (el.textContent || '').trim().slice(0, 120), pos: getComputedStyle(el).position }));
    return { inputVal: val, cands };
  });
  log('AFTER_TYPE', JSON.stringify(afterType, null, 1).slice(0, 2000));
  fs.writeFileSync(path.join(OUT, '13-after-type.json'), JSON.stringify(afterType, null, 1), 'utf8');

  // 按回车
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  const afterEnter = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const rows = [...document.querySelectorAll('tr,[class*=table-row],[class*=Row]')].filter(r => r.getBoundingClientRect().height > 30);
    return {
      totalRows: rows.length,
      texts: rows.slice(0, 8).map(r => (r.textContent || '').trim().slice(0, 60)),
      hasZhu: rows.some(r => (r.textContent || '').includes('朱鹏旭')),
      bodyHasZhu: document.body.innerText.includes('朱鹏旭'),
    };
  });
  log('AFTER_ENTER', JSON.stringify(afterEnter));
  fs.writeFileSync(path.join(OUT, '13-after-enter.json'), JSON.stringify(afterEnter, null, 1), 'utf8');
  await page.screenshot({ path: path.join(OUT, '13-after-enter.png') });

  log('---API---');
  apiReq.forEach(r => log('  ', r.u.replace('https://idreamsky.feishu.cn', ''), (r.pd || '').slice(0, 200)));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
