/* capture3b: 补抓
 * - mkdir api/, 保存 /perf/api/ JSON body
 * - 保存 CSS
 * - 横向滚动让操作列可见
 * - 点击「查看更新记录」弹窗
 * - 「更新人员信息」弹窗 + 勾选4个checkbox观察联动（不提交，Esc关闭）
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const URL = 'https://idreamsky.feishu.cn/perf/admin/semester-activities/7702053437998894368/info-list?activeKey=employee&showDepartment=true';
const OUT = path.join(__dirname, 'out', 'capture3b');
fs.mkdirSync(path.join(OUT, 'api'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'css'), { recursive: true });

function safeName(u) {
  let s = u.replace(/^https?:\/\//, '').replace(/[?&#].*$/, '').replace(/[^a-zA-Z0-9._\/-]/g, '_');
  if (s.length > 120) s = s.slice(0, 60) + '__' + crypto.createHash('md5').update(u).digest('hex').slice(0, 10);
  return s.replace(/\//g, '__');
}

const net = [];
let apiCount = 0, cssCount = 0;
async function attachNet(page, tag) {
  page.on('response', async (res) => {
    try {
      const ct = (res.headers()['content-type'] || '');
      const entry = { phase: tag, t: Date.now(), url: res.url(), status: res.status(), method: res.request().method(), ct: ct.split(';')[0] };
      if ((ct.includes('json') || (ct.includes('text') && !ct.includes('html'))) && res.url().includes('/perf/api/')) {
        const body = await res.body().catch(() => null);
        if (body && body.length < 8 * 1024 * 1024) {
          const fn = `${tag}_${String(apiCount).padStart(3, '0')}_${safeName(res.url())}.${ct.includes('json') ? 'json' : 'txt'}`;
          fs.writeFileSync(path.join(OUT, 'api', fn), body);
          entry.savedAs = `api/${fn}`;
          entry.size = body.length;
          apiCount++;
        }
      }
      net.push(entry);
    } catch (e) {}
  });
}

async function dumpCSS(page) {
  const cssInfo = await page.evaluate(async () => {
    const out = [];
    for (const ss of document.styleSheets) {
      const href = ss.href || '(inline)';
      try {
        out.push({ href, css: [...ss.cssRules].map(r => r.cssText).join('\n') });
      } catch (e) {
        if (ss.href) {
          try {
            const resp = await fetch(ss.href, { credentials: 'include' });
            out.push({ href, css: await resp.text() });
          } catch (e2) { out.push({ href, error: String(e2) }); }
        }
      }
    }
    return out;
  });
  for (const c of cssInfo) {
    if (!c.css || c.css.length < 50) continue;
    fs.writeFileSync(path.join(OUT, 'css', `${String(cssCount).padStart(3, '0')}_${safeName(c.href)}.css`), c.css);
    cssCount++;
  }
  console.log('[css]', cssCount, 'files');
}

async function dumpPage(page, dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(3500);
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch (e) {}
  const html = await page.content();
  fs.writeFileSync(path.join(dir, `${name}.html`), html);
  await page.screenshot({ path: path.join(dir, `${name}-viewport.png`), fullPage: false }).catch(() => {});
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true }).catch(() => {});
  console.log('[dump]', name);
}

async function snapshotStyles(page, selectors, outFile) {
  const data = await page.evaluate((sels) => {
    const PROPS = ['font-family','font-size','font-weight','line-height','color','background-color','border','border-radius','padding','margin','box-shadow','height','width','display','align-items','justify-content','gap','letter-spacing','opacity','cursor','text-decoration'];
    const out = [];
    for (const sel of sels) {
      document.querySelectorAll(sel).forEach((el, i) => {
        if (out.length > 250) return;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        const cs = getComputedStyle(el);
        const o = { sel, index: i, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, cls: (el.className||'').toString().slice(0,300), text: (el.innerText||'').slice(0,80) };
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
  await attachNet(page, 'list');

  console.log('[1] goto');
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => (document.body.innerText || '').length > 400, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(6000);
  await dumpCSS(page);

  // 横向滚动: 让操作列完全进入视口
  const scrolled = await page.evaluate(() => {
    // 找所有可横向滚动的祖先容器, 滚到最右
    let done = 0;
    const els = document.querySelectorAll('*');
    for (const el of els) {
      if (el.scrollWidth > el.clientWidth + 20 && el.clientWidth > 300) {
        const st = getComputedStyle(el);
        if (['auto','scroll'].includes(st.overflowX)) { el.scrollLeft = el.scrollWidth; done++; }
      }
    }
    return done;
  });
  console.log('[scroll]', scrolled, 'containers');
  await page.waitForTimeout(1000);
  await dumpPage(page, path.join(OUT, 'list-scrolled'), 'list-scrolled');

  // ============ 2) 查看更新记录 ============
  console.log('[2] 查看更新记录');
  const netMarkA = net.length;
  let clicked = false;
  const locs = page.locator('text=查看更新记录');
  const n = await locs.count().catch(() => 0);
  console.log('[2] matches:', n);
  for (let i = 0; i < Math.min(n, 8); i++) {
    const loc = locs.nth(i);
    try {
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 });
      if (await loc.isVisible() && await loc.isEnabled()) {
        await loc.click({ timeout: 5000 });
        clicked = true;
        console.log('[2] clicked match', i);
        break;
      }
    } catch (e) { console.log('[2] match', i, 'err', e.message.slice(0, 50)); }
  }
  if (clicked) {
    for (const ph of net.slice(netMarkA)) { ph.phase = 'record_modal'; }
    await page.waitForTimeout(5000);
    await dumpPage(page, path.join(OUT, 'record-modal'), 'record-modal');
    await snapshotStyles(page, ['[class*="ud__modal"]', '[class*="ud__table"]', '[class*="ud__table"] *', '[class*="ud__modal"] [class*="button"]'], 'styles-record.json');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);
  } else {
    console.log('[2] FAIL 未点到查看更新记录');
  }

  // ============ 3) 更新人员信息 ============
  console.log('[3] 更新人员信息');
  const netMarkB = net.length;
  clicked = false;
  const locs2 = page.locator('text=更新人员信息');
  const n2 = await locs2.count().catch(() => 0);
  console.log('[3] matches:', n2);
  for (let i = 0; i < Math.min(n2, 8); i++) {
    const loc = locs2.nth(i);
    try {
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 });
      if (await loc.isVisible() && await loc.isEnabled()) {
        await loc.click({ timeout: 5000 });
        clicked = true;
        console.log('[3] clicked match', i);
        break;
      }
    } catch (e) { console.log('[3] match', i, 'err', e.message.slice(0, 50)); }
  }
  if (clicked) {
    for (const ph of net.slice(netMarkB)) { ph.phase = 'update_modal'; }
    await page.waitForTimeout(5000);
    await dumpPage(page, path.join(OUT, 'update-modal'), 'update-modal');
    await snapshotStyles(page, ['[class*="ud__modal"]', '[class*="ud__modal"] *', '[class*="ud__checkbox"]', '[class*="ud__checkbox"] *'], 'styles-update.json');

    // 勾选4个checkbox观察联动 (不提交)
    const boxes = page.locator('[class*="ud__checkbox"]');
    const bn = await boxes.count().catch(() => 0);
    console.log('[3] checkboxes:', bn);
    const fsDir = path.join(OUT, 'update-modal-checked');
    fs.mkdirSync(fsDir, { recursive: true });
    const checkNames = ['序列', '职级', '直属上级', '部门'];
    let ci = 0;
    for (const name of checkNames) {
      try {
        const lbl = page.locator(`text=${name}`).last();
        await lbl.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
        await lbl.click({ timeout: 3000 });
        ci++;
        await page.waitForTimeout(2500);
        await page.screenshot({ path: path.join(fsDir, `checked-${ci}-${name}.png`), fullPage: false }).catch(() => {});
        fs.writeFileSync(path.join(fsDir, `checked-${ci}-${name}.html`), await page.content());
        console.log('[3] checked', name);
      } catch (e) { console.log('[3] check', name, 'err', e.message.slice(0, 50)); }
    }
    for (const ph of net.slice(netMarkB)) { if (ph.phase === 'update_modal') ph.phase = 'update_modal_checked'; }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);
  } else {
    console.log('[3] FAIL 未点到更新人员信息');
  }

  fs.writeFileSync(path.join(OUT, 'network.json'), JSON.stringify(net, null, 2));
  console.log('[done] api=', apiCount, 'css=', cssCount, 'net=', net.length);
  await page.waitForTimeout(4000);
  await ctx.close();
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
