/* 第二轮交互抓取: 内容设置页 + 预览页各环节切换 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = 'https://idreamsky.feishu.cn/perf/admin/templates/7699791798989900738';
const OUT = path.join(__dirname, 'out', 'capture2');
fs.mkdirSync(OUT, { recursive: true });

function safeName(u) {
  let s = u.replace(/^https?:\/\//, '').replace(/[?&#].*$/, '').replace(/[^a-zA-Z0-9._\/-]/g, '_');
  if (s.length > 120) s = s.slice(0, 60) + '__' + crypto.createHash('md5').update(u).digest('hex').slice(0, 10);
  return s.replace(/\//g, '__');
}

async function attachNet(page, logArr) {
  page.on('response', async (res) => {
    try {
      const ct = (res.headers()['content-type'] || '');
      const entry = { t: Date.now(), url: res.url(), status: res.status(), method: res.request().method(), ct: ct.split(';')[0] };
      if (ct.includes('json') && res.url().includes('/perf/api/')) {
        const body = await res.body().catch(() => null);
        if (body && body.length < 5 * 1024 * 1024) {
          const fn = `${Date.now()}_${String(logArr.length).padStart(3, '0')}_${safeName(res.url())}.json`;
          fs.writeFileSync(path.join(OUT, fn), body);
          entry.savedAs = fn;
        }
      }
      logArr.push(entry);
    } catch (e) {}
  });
}

async function dumpPage(page, dir, shot = true) {
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(5000);
  try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch (e) {}
  const html = await page.content();
  fs.writeFileSync(path.join(dir, 'page.html'), html);
  if (shot) await page.screenshot({ path: path.join(dir, 'page.png'), fullPage: true }).catch(() => {});
}

(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, 'profile'), {
    headless: false,
    viewport: { width: 1680, height: 950 },
    deviceScaleFactor: 2,
    args: ['--start-maximized'],
  });
  const page = await ctx.newPage();
  const net = [];
  await attachNet(page, net);

  // 1) 内容设置页 (step 3)
  console.log('[1] goto step3 内容设置');
  await page.goto(BASE + '/3', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.waitForFunction(() => (document.body.innerText || '').length > 400, { timeout: 60000 }).catch(() => {});
  await dumpPage(page, path.join(OUT, 'step3-content'));
  console.log('[1] done');

  // 2) 预览页 (step 4) + 左侧环节遍历
  console.log('[2] goto step4 模板预览');
  await page.goto(BASE + '/4', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => (document.body.innerText || '').includes('评估流程'), { timeout: 60000 }).catch(() => {});
  await dumpPage(page, path.join(OUT, 'step4-preview'));

  // 左侧环节卡片: class 里带 SideItem 的不一定是,预览页左侧是评估流程卡。用文本定位可点击项
  const stageNames = ['填写工作总结', '自评', '360°邀请环节', '360°反馈（自愿评估）', '评估型环节', '虚线上级评估', '直接上级评估', '绩效校准', '绩效沟通并开通结果', '查看绩效结果', '结果复议处理', '我的团队'];
  for (const name of stageNames) {
    try {
      const loc = page.locator(`text=${name}`).first();
      if (!(await loc.isVisible().catch(() => false))) { console.log('[skip]', name); continue; }
      await loc.click({ timeout: 5000 });
      const safe = name.replace(/[°（）]/g, '');
      await page.waitForTimeout(2500);
      // 只抓三栏容器
      const panel = await page.evaluate(() => {
        const el = document.querySelector('.full-screen-modal') || document.body;
        return el.outerHTML.slice(0, 500000);
      });
      fs.mkdirSync(path.join(OUT, 'stages'), { recursive: true });
      fs.writeFileSync(path.join(OUT, 'stages', `${safe}.html`), panel);
      await page.screenshot({ path: path.join(OUT, 'stages', `${safe}.png`), fullPage: false }).catch(() => {});
      console.log('[stage]', name, 'ok');
    } catch (e) { console.log('[stage err]', name, e.message.slice(0, 80)); }
  }

  fs.writeFileSync(path.join(OUT, 'network.json'), JSON.stringify(net, null, 2));
  console.log('[done] net entries:', net.length);
  await page.waitForTimeout(5000);
  await ctx.close();
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
