/* 第三轮交互抓取: 周期活动 info-list 页 + 「查看更新记录」「更新人员信息」两个操作弹窗
 * 注意: 只读取、只打开弹窗, 绝不提交/保存任何表单
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const URL = 'https://idreamsky.feishu.cn/perf/admin/semester-activities/7702053437998894368/info-list?activeKey=employee&showDepartment=true';
const OUT = path.join(__dirname, 'out', 'capture3-infolist');
fs.mkdirSync(OUT, { recursive: true });

function safeName(u) {
  let s = u.replace(/^https?:\/\//, '').replace(/[?&#].*$/, '').replace(/[^a-zA-Z0-9._\/-]/g, '_');
  if (s.length > 120) s = s.slice(0, 60) + '__' + crypto.createHash('md5').update(u).digest('hex').slice(0, 10);
  return s.replace(/\//g, '__');
}

let apiCount = 0;
async function attachNet(page, tag) {
  page.on('response', async (res) => {
    try {
      const ct = (res.headers()['content-type'] || '');
      const entry = { phase: tag, t: Date.now(), url: res.url(), status: res.status(), method: res.request().method(), ct: ct.split(';')[0] };
      if (ct.includes('json') && res.url().includes('/perf/api/')) {
        const body = await res.body().catch(() => null);
        if (body && body.length < 8 * 1024 * 1024) {
          const fn = `api/${tag}_${String(apiCount).padStart(3, '0')}_${safeName(res.url())}.json`;
          fs.writeFileSync(path.join(OUT, fn), body);
          entry.savedAs = fn;
          entry.size = body.length;
          apiCount++;
        }
      }
      net.push(entry);
    } catch (e) {}
  });
}
const net = [];

async function dumpPage(page, dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(4000);
  try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch (e) {}
  const html = await page.content();
  fs.writeFileSync(path.join(dir, `${name}.html`), html);
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true }).catch(e => console.log('[shot err]', e.message));
  await page.screenshot({ path: path.join(dir, `${name}-viewport.png`), fullPage: false }).catch(() => {});
  console.log('[dump]', name);
}

// 提取指定元素的computed style 快照
async function snapshotStyles(page, selectors, outFile) {
  const data = await page.evaluate((sels) => {
    const PROPS = ['font-family','font-size','font-weight','line-height','color','background-color','border','border-radius','padding','margin','box-shadow','height','width','display','align-items','justify-content','gap','letter-spacing','opacity','cursor'];
    const out = [];
    for (const sel of sels) {
      document.querySelectorAll(sel).forEach((el, i) => {
        if (i > 6) return;
        const cs = getComputedStyle(el);
        const o = { sel, index: i, rect: (()=>{const r=el.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};})(), cls: (el.className||'').toString().slice(0,300), text: (el.innerText||'').slice(0,80) };
        for (const p of PROPS) o[p] = cs.getPropertyValue(p);
        out.push(o);
      });
    }
    return out;
  }, selectors).catch(e => { console.log('[style err]', e.message); return []; });
  fs.writeFileSync(path.join(OUT, outFile), JSON.stringify(data, null, 2));
  console.log('[styles]', outFile, data.length, 'nodes');
}

(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, 'profile'), {
    headless: false,
    viewport: { width: 1680, height: 950 },
    deviceScaleFactor: 2,
    args: ['--start-maximized'],
  });
  const page = await ctx.newPage();
  await attachNet(page, 'p0_list');

  console.log('[1] goto info-list');
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 等页面渲染出列表内容
  await page.waitForFunction(() => (document.body.innerText || '').length > 400, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(6000);

  // 落盘列表页
  await dumpPage(page, path.join(OUT, 'list'), 'list');
  await snapshotStyles(page, [
    'button', '[class*="ud__button"]', '[class*="ud__table"] th', '[class*="ud__table"] td',
    '[class*="ud__tag"]', '[class*="ud__modal"]', '[class*="ud__select"]',
  ], 'styles-list.json');

  // ============ 2) 查看更新记录 ============
  console.log('[2] 点击 查看更新记录');
  let clicked = false;
  for (const sel of ['text=查看更新记录', 'text=更新记录']) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.isVisible({ timeout: 3000 }).catch(() => false)) {
        await loc.click({ timeout: 5000 });
        clicked = true;
        console.log('[2] clicked via', sel);
        break;
      }
    } catch (e) { console.log('[2] try', sel, e.message.slice(0, 60)); }
  }
  if (clicked) {
    await page.waitForTimeout(5000);
    await dumpPage(page, path.join(OUT, 'update-record-modal'), 'update-record-modal');
    await snapshotStyles(page, ['[class*="ud__modal"]', '[class*="ud__modal"] *', '[class*="drawer"]'], 'styles-update-record.json');
    // 关闭弹窗: Esc
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);
  } else {
    console.log('[2] 未找到 查看更新记录 按钮');
  }

  // ============ 3) 更新人员信息 ============
  console.log('[3] 点击 更新人员信息');
  clicked = false;
  for (const sel of ['text=更新人员信息', 'text=人员信息']) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.isVisible({ timeout: 3000 }).catch(() => false)) {
        await loc.click({ timeout: 5000 });
        clicked = true;
        console.log('[3] clicked via', sel);
        break;
      }
    } catch (e) { console.log('[3] try', sel, e.message.slice(0, 60)); }
  }
  if (clicked) {
    await page.waitForTimeout(5000);
    await dumpPage(page, path.join(OUT, 'update-employee-modal'), 'update-employee-modal');
    await snapshotStyles(page, ['[class*="ud__modal"]', '[class*="ud__modal"] *', '[class*="ud__form"]', '[class*="ud__form"] *'], 'styles-update-employee.json');
    // 绝不提交, 直接 Esc 关闭
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);
  } else {
    console.log('[3] 未找到 更新人员信息 按钮');
  }

  // 最终确认无残留写操作
  await dumpPage(page, path.join(OUT, 'final'), 'final');
  fs.writeFileSync(path.join(OUT, 'network.json'), JSON.stringify(net, null, 2));
  console.log('[done] api=', apiCount, 'net=', net.length);
  await page.waitForTimeout(5000);
  await ctx.close();
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
