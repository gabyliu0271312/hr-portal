/* REA 编辑链路采集 13：点「变更记录」tab 前后网络差分（GET+POST）
 * 确认变更记录数据接口 + 变更人员数按钮点击行为
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

  const m = page.url().match(/^(https:\/\/idreamsky\.feishu\.cn\/perf\/admin\/semester-activities\/\d+)\/focus-people\/management\/(\d+)/);
  const base = m && m[1];
  const groupId = m && m[2];
  if (!base || !groupId) { log('NO_MGMT_URL'); await browser.close().catch(() => {}); process.exit(2); }
  const detailUrl = `${base}/focus-people/management/${groupId}`;

  const beforeApi = [];
  const afterApi = [];

  async function collect(resp, store) {
    const u = resp.url();
    if (!/\/perf\/api\//.test(u)) return;
    const method = resp.request().method();
    let body = '';
    try { body = await resp.text(); } catch {}
    const entry = { m: method, url: u.replace(/^https:\/\/idreamsky\.feishu\.cn/, ''), status: resp.status(), len: body.length, body: body.slice(0, 2500) };
    store.push(entry);
    log('REQ', method, entry.url.slice(0, 110), entry.status, entry.len);
  }

  log('goto:', detailUrl);
  await page.goto(detailUrl, { waitUntil: 'networkidle' }).catch(e => log('goto err', e.message));
  await page.waitForTimeout(1200);

  // 点「变更记录」tab，记录新增请求
  const afterListener = resp => collect(resp, afterApi);
  page.on('response', afterListener);
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
  log('tab:', JSON.stringify(tabBtn));
  if (tabBtn) { await page.mouse.click(tabBtn.x, tabBtn.y); await page.waitForTimeout(2500); }
  page.off('response', afterListener);
  log('after click URL:', page.url());

  // 变更记录表格
  const tableInfo = await page.evaluate(() => {
    const out = { url: location.href, tables: [] };
    const tables = Array.from(document.querySelectorAll('table'));
    for (const table of tables) {
      const head = (table.querySelector('thead')?.innerText || '').trim();
      if (!head.includes('操作人')) continue;
      out.tables.push({
        head,
        colWidths: Array.from(table.querySelectorAll('th')).map(th => Math.round(th.getBoundingClientRect().width)),
        rows: Array.from(table.querySelectorAll('tbody tr')).map(tr => Array.from(tr.querySelectorAll('td')).map(td => (td.innerText || '').trim().slice(0, 80))),
      });
    }
    return out;
  });
  fs.writeFileSync(path.join(OUT, 'changelog-diff.json'), JSON.stringify({ before: beforeApi.map(e => ({ m: e.m, url: e.url, status: e.status, len: e.len })), after: afterApi, tableInfo }, null, 1), 'utf8');
  log('before:', beforeApi.length, 'after(new):', afterApi.length);
  log('table rows:', tableInfo.tables.length ? tableInfo.tables[0].rows.length : 0);

  // 点第一个「变更人员数」数字按钮
  const countBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    for (const b of btns) {
      const t = (b.innerText || '').trim();
      if (/^\d+$/.test(t) && t.length <= 3) {
        const r = b.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), text: t };
      }
    }
    return null;
  });
  log('count btn:', JSON.stringify(countBtn));
  if (countBtn) {
    const countListener = resp => collect(resp, afterApi);
    page.on('response', countListener);
    await page.mouse.click(countBtn.x, countBtn.y);
    await page.waitForTimeout(2000);
    page.off('response', countListener);
    const detailText = await page.evaluate(() => {
      const modals = Array.from(document.querySelectorAll('[class*="modal"], [class*="drawer"], [class*="popup"], [class*="popper"]'));
      return modals.map(el => ({ cls: String(el.className).slice(0, 80), text: (el.innerText || '').trim().slice(0, 300) })).filter(x => x.text);
    });
    fs.writeFileSync(path.join(OUT, 'changelog-count-detail.json'), JSON.stringify({ url: page.url(), modals: detailText }, null, 1), 'utf8');
    log('count detail modals:', detailText.length);
    detailText.forEach(d => log('  MODAL', d.cls, JSON.stringify(d.text.slice(0, 150))));
    await page.screenshot({ path: path.join(OUT, 'changelog-count-open.png') }).catch(e => log('shot err', e.message));
  }

  fs.writeFileSync(path.join(OUT, 'changelog-diff.json'), JSON.stringify({ before: beforeApi.map(e => ({ m: e.m, url: e.url, status: e.status, len: e.len })), after: afterApi, tableInfo }, null, 1), 'utf8');
  await browser.close().catch(() => {});
  log('DONE');
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
