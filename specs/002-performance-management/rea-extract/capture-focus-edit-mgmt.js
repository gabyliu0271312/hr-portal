/* REA 编辑链路采集 1：人员组详情管理页（management/{groupId}）完整结构
 * 采集 head / 基本信息卡片 / 人员列表 tab / 变更记录 tab / 空态 / 操作按钮
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
    if (p.url().includes('/focus-people/management/')) page = p;
  }
  if (!page) { log('NO_MANAGEMENT_PAGE'); await browser.close().catch(() => {}); process.exit(2); }
  await page.waitForTimeout(600);
  log('URL:', page.url());

  // ========== 完整结构采集 ==========
  const struct = await page.evaluate(() => {
    const out = { viewport: [innerWidth, innerHeight], nodes: [] };
    // 关键区域：head / 卡片 / tabs / 表格 / 空态
    const seen = new Set();
    const push = (el, label) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const cs = getComputedStyle(el);
      out.nodes.push({
        label, tag: el.tagName, cls: String(el.className || '').slice(0, 120),
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        font: cs.fontSize + '/' + cs.fontWeight + ' ' + cs.fontFamily.slice(0, 40),
        color: cs.color, bg: cs.backgroundColor,
        border: cs.borderBottomWidth + ' ' + cs.borderBottomColor,
        radius: cs.borderRadius,
        pad: cs.paddingTop + ' ' + cs.paddingRight + ' ' + cs.paddingBottom + ' ' + cs.paddingLeft,
        margin: cs.marginTop + ' ' + cs.marginRight + ' ' + cs.marginBottom + ' ' + cs.marginLeft,
        display: cs.display, flex: cs.flexDirection + ' ' + cs.justifyContent + ' ' + cs.alignItems,
        gap: cs.gap, lineHeight: cs.lineHeight, pos: cs.position,
        text: (el.innerText || '').trim().slice(0, 30)
      });
    };
    // head
    const head = document.querySelector('.indexstyled__ModalHeader, [class*="ModalHeader"]');
    push(head, 'HEAD');
    // 返回按钮
    const back = Array.from(document.querySelectorAll('*')).find(e => (e.innerText || '').trim() === '返回' && e.children.length < 3);
    if (back) push(back.parentElement || back, 'GOBACK');
    // 标题
    const title = Array.from(document.querySelectorAll('*')).find(e => (e.innerText || '').trim() === '人员组管理' && e.children.length === 0);
    if (title) push(title, 'TITLE');
    // 卡片（基本信息 / 其他）
    document.querySelectorAll('[class*="card"], .ud__card, [class*="shadow-md"]').forEach(el => push(el, 'CARD'));
    // tabs
    document.querySelectorAll('.ud__tabs, [class*="tab-bar"]').forEach(el => push(el, 'TABS'));
    // 按钮
    document.querySelectorAll('button').forEach(el => push(el, 'BUTTON'));
    // 表格
    document.querySelectorAll('.ud__table, .ud__table-wrapper, table, [class*="table"]').forEach(el => push(el, 'TABLE'));
    // 空态
    document.querySelectorAll('.ud__empty, [class*="empty"]').forEach(el => push(el, 'EMPTY'));
    // 搜索框
    document.querySelectorAll('.ud__search, .ud__input').forEach(el => push(el, 'INPUT'));
    return out;
  });
  fs.writeFileSync(path.join(OUT, 'management-struct.json'), JSON.stringify(struct, null, 1), 'utf8');
  log('STRUCT nodes:', struct.nodes.length);

  // ========== 全部文本 ==========
  const txt = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(path.join(OUT, 'management-text.txt'), txt, 'utf8');

  // ========== 截图（全页 + 顶部） ==========
  await page.screenshot({ path: path.join(OUT, 'management-top.png') }).catch(e => log('shot1 err', e.message));
  const fullH = await page.evaluate(() => document.body.scrollHeight);
  log('body height:', fullH, 'innerHeight:', struct.viewport[1]);
  if (fullH > 900) {
    await page.screenshot({ path: path.join(OUT, 'management-full.png'), fullPage: true }).catch(e => log('shot2 err', e.message));
  }

  // ========== 网络：点击「编辑」前的关键接口 ==========
  const apiLog = [];
  const onResp = async (resp) => {
    const u = resp.url();
    if (/\/perf\/api\//.test(u) && resp.request().method() === 'GET') {
      let body = '';
      try { body = await resp.text(); } catch {}
      apiLog.push({ m: 'GET', url: u.replace(/^https:\/\/idreamsky\.feishu\.cn/, ''), status: resp.status(), len: body.length, body: body.slice(0, 600) });
    }
  };
  page.on('response', onResp);
  await page.reload({ waitUntil: 'networkidle' }).catch(e => log('reload err', e.message));
  await page.waitForTimeout(1200);
  page.off('response', onResp);
  fs.writeFileSync(path.join(OUT, 'management-api.json'), JSON.stringify(apiLog, null, 1), 'utf8');
  log('API entries:', apiLog.length);

  await browser.close().catch(() => {});
  log('DONE');
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
