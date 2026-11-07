/* REA 编辑链路采集 11：详情管理页「变更记录」tab
 * 从当前页面导航到详情管理页 → 点「变更记录」→ 采集 DOM/接口/截图
 */
process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out', 'focus-edit', 'changelog');
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctxs = browser.contexts();
  let page = null;
  for (const ctx of ctxs) for (const p of ctx.pages()) {
    if (/idreamsky\.feishu\.cn\/perf\/admin/.test(p.url())) page = p;
  }
  if (!page) { log('NO_PERF_PAGE'); await browser.close().catch(() => {}); process.exit(2); }
  log('current URL:', page.url());

  // 1. 导航到详情管理页（当前是编辑表单 focus-people/edit/7669998387978046396 → management/7669998387978046396）
  const m = page.url().match(/focus-people\/(?:edit|management)\/(\d+)/);
  const groupId = m ? m[1] : null;
  log('groupId:', groupId);
  if (groupId) {
    const detailUrl = page.url().replace(/focus-people\/(?:edit|management)\/\d+/, `focus-people/management/${groupId}`);
    log('navigate:', detailUrl);
    await page.goto(detailUrl, { waitUntil: 'networkidle' }).catch(e => log('goto err', e.message));
    await page.waitForTimeout(1500);
  }

  // 2. 找到并点击「变更记录」tab
  const tabBtn = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[class*="tab"]'));
    for (const el of els) {
      if ((el.innerText || '').trim() === '变更记录') {
        const r = el.getBoundingClientRect();
        if (r.width > 0) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      }
    }
    return null;
  });
  log('changelog tab:', JSON.stringify(tabBtn));
  if (tabBtn) {
    await page.mouse.click(tabBtn.x, tabBtn.y);
    await page.waitForTimeout(1800);
  }

  // 3. 采集变更记录 tab 内容
  const struct = await page.evaluate(() => {
    const out = { viewport: [innerWidth, innerHeight], url: location.href, nodes: [], texts: [] };
    const seen = new Set();
    const push = (el, label) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const cs = getComputedStyle(el);
      out.nodes.push({
        label, tag: el.tagName, cls: String(el.className || '').slice(0, 110),
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        font: cs.fontSize + '/' + cs.fontWeight + ' ' + (cs.fontFamily || '').slice(0, 30),
        color: cs.color, bg: cs.backgroundColor,
        border: cs.borderBottomWidth + ' ' + cs.borderBottomColor,
        radius: cs.borderRadius, pad: cs.padding, margin: cs.margin,
        display: cs.display, flex: cs.flexDirection + ' ' + cs.justifyContent + ' ' + cs.alignItems,
        gap: cs.gap, lineHeight: cs.lineHeight, pos: cs.position,
        text: (el.innerText || '').trim().slice(0, 50)
      });
    };
    // 全 tab 面板内容（变更记录区域）
    document.querySelectorAll('[class*="tab"] [class*="panel"], [class*="tab"] [class*="content"], .ud__tabs [class*="pane"], [class*="tab"] [class*="body"]').forEach(el => push(el, 'TAB_PANEL'));
    // 时间线 / 列表项
    document.querySelectorAll('[class*="timeline"], [class*="record"], [class*="history"], [class*="event"], [class*="list-item"], [class*="changelog"]').forEach(el => push(el, 'ITEM'));
    // 文本
    out.texts = Array.from(document.querySelectorAll('*'))
      .filter(el => {
        const t = (el.innerText || '').trim();
        return t && t.length < 80 && el.children.length === 0;
      })
      .slice(0, 120)
      .map(el => ({ text: (el.innerText || '').trim().slice(0, 80), cls: String(el.className || '').slice(0, 60), tag: el.tagName }));
    return out;
  });
  fs.writeFileSync(path.join(OUT, 'changelog-struct.json'), JSON.stringify(struct, null, 1), 'utf8');
  log('STRUCT nodes:', struct.nodes.length, 'texts:', struct.texts.length);

  const txt = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(path.join(OUT, 'changelog-text.txt'), txt, 'utf8');

  await page.screenshot({ path: path.join(OUT, 'changelog-top.png') }).catch(e => log('shot1 err', e.message));

  // 4. 网络：采集变更记录相关接口（点击 tab 后可能懒加载）
  const apiLog = [];
  const onResp = async (resp) => {
    const u = resp.url();
    if (/\/perf\/api\//.test(u) && resp.request().method() === 'GET') {
      let body = '';
      try { body = await resp.text(); } catch {}
      if (/change|history|audit|record|log|event/.test(u)) {
        apiLog.push({ m: 'GET', url: u.replace(/^https:\/\/idreamsky\.feishu\.cn/, ''), status: resp.status(), len: body.length, body: body.slice(0, 1500) });
      }
    }
  };
  page.on('response', onResp);
  await page.reload({ waitUntil: 'networkidle' }).catch(e => log('reload err', e.message));
  await page.waitForTimeout(1200);
  // reload 后重新点 tab
  const tabBtn2 = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[class*="tab"]'));
    for (const el of els) {
      if ((el.innerText || '').trim() === '变更记录') {
        const r = el.getBoundingClientRect();
        if (r.width > 0) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      }
    }
    return null;
  });
  if (tabBtn2) {
    await page.mouse.click(tabBtn2.x, tabBtn2.y);
    await page.waitForTimeout(1800);
  }
  page.off('response', onResp);
  fs.writeFileSync(path.join(OUT, 'changelog-api.json'), JSON.stringify(apiLog, null, 1), 'utf8');
  log('API entries:', apiLog.length);
  apiLog.forEach(a => log('  API', a.url.slice(0, 100), a.status, a.len));

  // 5. 截图（变更记录 tab 视图）
  await page.screenshot({ path: path.join(OUT, 'changelog-tab.png') }).catch(e => log('shot3 err', e.message));

  await browser.close().catch(() => {});
  log('DONE');
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
