/* REA 编辑链路采集 3：编辑页接口（group/info 详情回显 + edit 保存 payload）
 * - 刷新页面监听 GET 接口（重点 follow/group/info）
 * - 路由拦截 POST follow/group/edit → 抓 payload 后 abort（不真提交）
 */
process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out', 'focus-edit');
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctxs = browser.contexts();
  let page = null;
  for (const ctx of ctxs) for (const p of ctx.pages()) {
    if (/\/activity-focus-people\/[0-9]+/.test(p.url())) page = p;
  }
  if (!page) { log('NO_EDIT_PAGE'); await browser.close().catch(() => {}); process.exit(2); }
  log('URL:', page.url());

  const apiLog = [];
  const onResp = async (resp) => {
    const u = resp.url();
    if (/\/perf\/api\//.test(u) && resp.request().method() === 'GET') {
      let body = '';
      try { body = await resp.text(); } catch {}
      apiLog.push({ m: 'GET', url: u.replace(/^https:\/\/idreamsky\.feishu\.cn/, ''), status: resp.status(), len: body.length, body: body.slice(0, 1500) });
    }
  };

  // 1) 刷新抓 GET 详情
  page.on('response', onResp);
  await page.reload({ waitUntil: 'networkidle' }).catch(e => log('reload err', e.message));
  await page.waitForTimeout(1500);
  page.off('response', onResp);
  fs.writeFileSync(path.join(OUT, 'edit-api-get.json'), JSON.stringify(apiLog, null, 1), 'utf8');
  log('GET api entries:', apiLog.length);
  apiLog.forEach(a => log('  GET', a.url.slice(0, 110), a.status, a.len));

  // 2) 拦截 POST follow/group/edit → 抓 payload
  const postLog = [];
  await page.route('**/perf/api/**', async route => {
    const req = route.request();
    const u = req.url();
    if (req.method() === 'POST' && /follow\/group\/edit/.test(u)) {
      let body = '';
      try { body = req.postData() || ''; } catch {}
      postLog.push({ url: u, body });
      log('INTERCEPT EDIT:', u.replace(/^https:\/\/idreamsky\.feishu\.cn/, ''));
      log('  PAYLOAD:', body.slice(0, 1200));
      route.abort().catch(() => {});
    } else {
      route.continue().catch(() => {});
    }
  });

  // 3) 点击「确定」→ 应触发 edit POST（被拦截）
  const confirmBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    for (const b of btns) {
      if ((b.innerText || '').trim() === '确定') {
        const r = b.getBoundingClientRect();
        if (r.width > 0) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      }
    }
    return null;
  });
  log('confirm center:', JSON.stringify(confirmBtn));
  if (confirmBtn) {
    await page.mouse.click(confirmBtn.x, confirmBtn.y);
    await page.waitForTimeout(2000);
    if (postLog.length === 0) log('NO_EDIT_INTERCEPTED (确认未触发 edit?)');
  }

  fs.writeFileSync(path.join(OUT, 'edit-api-post.json'), JSON.stringify(postLog, null, 1), 'utf8');

  await browser.close().catch(() => {});
  log('DONE');
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
