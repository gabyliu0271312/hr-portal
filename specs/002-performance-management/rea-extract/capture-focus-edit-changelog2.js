/* REA 编辑链路采集 12：定位变更记录数据来源接口 + 操作条件列内容
 * 导航到详情页 → 记录所有 perf GET（长窗口）→ 点「变更记录」→ 采操作条件列 + 分页 + 接口
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

  // 导航到详情页（URL 可能是 management/ 或 activity-focus-people/）
  const m = page.url().match(/(?:focus-people|activity-focus-people)\/(?:edit|management)\/(\d+)/);
  const groupId = m ? m[1] : null;
  const base = page.url().match(/^(https:\/\/idreamsky\.feishu\.cn\/perf\/admin\/semester-activities\/\d+)/);
  log('groupId:', groupId, 'base:', base && base[1]);
  const detailUrl = groupId && base
    ? `${base[1]}/focus-people/management/${groupId}`
    : null;
  if (!detailUrl) { log('NO_DETAIL_URL'); await browser.close().catch(() => {}); process.exit(2); }

  // 1. 记录页面加载的全部 perf GET（含变更记录数据）
  const allApi = [];
  const onResp = async (resp) => {
    const u = resp.url();
    if (/\/perf\/api\//.test(u) && resp.request().method() === 'GET') {
      let body = '';
      try { body = await resp.text(); } catch {}
      allApi.push({ url: u.replace(/^https:\/\/idreamsky\.feishu\.cn/, ''), status: resp.status(), len: body.length, body: body.slice(0, 800) });
    }
  };
  page.on('response', onResp);
  log('goto:', detailUrl);
  await page.goto(detailUrl, { waitUntil: 'domcontentloaded' }).catch(e => log('goto err', e.message));
  // 长窗口：等 4 秒覆盖所有懒加载
  await page.waitForTimeout(4000);
  log('after load URL:', page.url());

  // 2. 点「变更记录」tab
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
  if (tabBtn) { await page.mouse.click(tabBtn.x, tabBtn.y); await page.waitForTimeout(1500); }
  page.off('response', onResp);
  fs.writeFileSync(path.join(OUT, 'changelog-all-api.json'), JSON.stringify(allApi, null, 1), 'utf8');
  log('ALL API entries:', allApi.length);
  allApi.forEach(a => log('  API', a.url.slice(0, 110), a.status, a.len));

  // 3. 采「操作条件」列内容（变更记录表格行）
  const rows = await page.evaluate(() => {
    const out = [];
    const thead = Array.from(document.querySelectorAll('th')).map(th => (th.innerText || '').trim());
    // 找变更记录表格（含操作人/操作类型列）
    const tables = Array.from(document.querySelectorAll('table'));
    for (const table of tables) {
      const headText = (table.querySelector('thead')?.innerText || '').trim();
      if (!headText.includes('操作人')) continue;
      Array.from(table.querySelectorAll('tbody tr')).forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('td')).map(td => {
          const r = td.getBoundingClientRect();
          return {
            text: (td.innerText || '').trim().slice(0, 120),
            cls: String(td.className || '').slice(0, 60),
            width: Math.round(r.width),
            html: td.innerHTML.slice(0, 200),
          };
        });
        out.push({ cells, head: headText.slice(0, 80) });
      });
      break;
    }
    return { tables, rows: out };
  });
  fs.writeFileSync(path.join(OUT, 'changelog-rows.json'), JSON.stringify(rows, null, 1), 'utf8');
  log('rows:', rows.rows.length, 'tables:', rows.tables.length);

  // 4. 变更记录区域截图
  await page.screenshot({ path: path.join(OUT, 'changelog-tab2.png') }).catch(e => log('shot err', e.message));

  await browser.close().catch(() => {});
  log('DONE');
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
