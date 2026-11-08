/* 360°评估率 tooltip 提炼 - 01: 抓列表接口响应 + 表格行 DOM + hover 弹窗
 * 用法：node capture-rate-tooltip-01-list-hover.js
 * 产出：out/rate-tooltip/01-list.json / 01-api.json / 01-hover-*.json
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

  const apiResp = [];
  const apiReq = [];
  page.on('response', async res => {
    const u = res.url();
    if (u.includes('/perf/api/report/v3/semesters/') && !/\.(js|css|png|svg|woff|ico)/.test(u)) {
      let body = ''; try { body = await res.text(); } catch {}
      apiResp.push({ u: u.slice(0, 300), st: res.status(), body: body.slice(0, 120000) });
    }
    if (u.includes('/perf/api/review/') && !/\.(js|css|png|svg|woff|ico)/.test(u)) {
      let body = ''; try { body = await res.text(); } catch {}
      apiResp.push({ u: u.slice(0, 300), st: res.status(), body: body.slice(0, 40000) });
    }
  });
  page.on('request', req => {
    const u = req.url();
    if (u.includes('/perf/api/') && !/\.(js|css|png|svg|woff|ico)/.test(u)) {
      apiReq.push({ m: req.method(), u: u.slice(0, 300), pd: (req.postData() || '').slice(0, 4000) });
    }
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  let waited = 0;
  while (waited < 150) {
    const t = await page.evaluate(() => document.body.innerText || '');
    if (/成员列表|360°|绩效评级/.test(t) && t.length > 300) break;
    await page.waitForTimeout(3000); waited += 3;
  }
  await page.waitForTimeout(4000);
  log('LOADED', page.url());

  // ---- 抓列表接口响应 ----
  await page.waitForTimeout(3000);
  const listApi = apiResp.find(r => /users\/list/.test(r.u) && r.body.length > 100);
  fs.writeFileSync(path.join(OUT, '01-api.json'), JSON.stringify({ req: apiReq, resp: apiResp }, null, 1), 'utf8');
  log('listApi?', !!listApi, listApi ? listApi.u.slice(0, 120) : '');
  if (listApi) log('LIST_BODY_PREVIEW', listApi.body.slice(0, 3000));

  // ---- 抓表格行 DOM ----
  const table = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const rows = [...document.querySelectorAll('[class*=table-row], [class*=Row]')]
      .filter(el => { const rr = el.getBoundingClientRect(); return rr.width > 800 && rr.height > 30 && rr.y > 250 && rr.y < 900; })
      .slice(0, 12)
      .map(el => {
        const cells = [...el.querySelectorAll('[class*=cell], td')]
          .filter(c => { const rr = c.getBoundingClientRect(); return rr.width > 0 && rr.height > 0 && el.contains(c); })
          .map(c => ({ t: (c.textContent || '').trim().slice(0, 50), ...rect(c), cls: (c.className || '').toString().slice(0, 50) }));
        return { ...rect(el), cls: (el.className || '').toString().slice(0, 60), cells };
      });
    return rows;
  });
  fs.writeFileSync(path.join(OUT, '01-list.json'), JSON.stringify(table, null, 1), 'utf8');
  await page.screenshot({ path: path.join(OUT, '01-list.png') });
  log('ROWS', table.length);
  table.forEach((r, i) => {
    const c = r.cells.map(x => `${x.t}@${x.x},${x.w}`).join(' | ');
    log(`  R${i} y=${r.y} h=${r.h}: ${c.slice(0, 200)}`);
  });

  // ---- hover 到「360°评估率」列某个有数值的 cell ----
  // 找 aaron.zhu 朱鹏旭 / alice.xiao 肖惠方 等行的 360°评估率 cell
  const rateCells = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    // 360°评估率列大约 x 2246~2690
    const candidates = [...document.querySelectorAll('div,span,[class*=cell]')]
      .filter(el => { const rr = el.getBoundingClientRect(); return rr.width > 20 && rr.height > 10 && rr.x > 2240 && rr.x < 2690 && rr.y > 280 && rr.y < 1000; })
      .map(el => ({ t: (el.textContent || '').trim().slice(0, 40), ...rect(el), cls: (el.className || '').toString().slice(0, 50), tag: el.tagName }))
      .filter(x => x.t);
    return candidates;
  });
  fs.writeFileSync(path.join(OUT, '01-rate-cells.json'), JSON.stringify(rateCells, null, 1), 'utf8');
  log('RATE_CELLS', rateCells.length);
  rateCells.forEach(c => log('  RC', c.t, c.x, c.y, c.w, c.h, c.tag, c.cls));

  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
