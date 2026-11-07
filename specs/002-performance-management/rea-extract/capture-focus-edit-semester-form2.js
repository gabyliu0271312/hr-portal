/* REA 编辑链路采集 9：周期版编辑表单（详情页 → 点「编辑」）
 * 核心：确认「人员范围设置方式」在编辑态是否禁用 + 完整字段/禁用态/回显/接口
 */
process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out', 'focus-edit', 'semester');
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctxs = browser.contexts();
  let page = null;
  for (const ctx of ctxs) for (const p of ctx.pages()) {
    if (/\/focus-people\/management\/[0-9]+/.test(p.url())) page = p;
  }
  if (!page) { log('NO_MGMT_PAGE'); await browser.close().catch(() => {}); process.exit(2); }
  log('URL:', page.url());

  // 点「编辑」
  const editBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    for (const b of btns) {
      if ((b.innerText || '').trim() === '编辑') {
        const r = b.getBoundingClientRect();
        if (r.width > 0) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      }
    }
    return null;
  });
  log('edit btn:', JSON.stringify(editBtn));
  if (!editBtn) { log('NO_EDIT_BTN'); await browser.close().catch(() => {}); process.exit(2); }
  await page.mouse.click(editBtn.x, editBtn.y);
  await page.waitForTimeout(2500);
  log('AFTER_CLICK URL:', page.url());
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(500);
    if (/\/focus-people\/edit\/[0-9]+|\/activity-focus-people\/[0-9]+/.test(page.url())) break;
  }
  log('FINAL URL:', page.url());

  // 完整结构（重点 radio 禁用态）
  const struct = await page.evaluate(() => {
    const out = { viewport: [innerWidth, innerHeight], url: location.href, nodes: [] };
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
        font: cs.fontSize + '/' + cs.fontWeight, color: cs.color, bg: cs.backgroundColor,
        border: cs.borderBottomWidth + ' ' + cs.borderBottomColor, radius: cs.borderRadius,
        disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
        pointerEvents: cs.pointerEvents, cursor: cs.cursor, opacity: cs.opacity,
        text: (el.innerText || '').trim().slice(0, 45)
      });
    };
    const head = document.querySelector('.indexstyled__ModalHeader, [class*="ModalHeader"]');
    push(head, 'HEAD');
    Array.from(document.querySelectorAll('*')).forEach(e => {
      const t = (e.innerText || '').trim();
      if ((t === '编辑人员组' || t === '新建人员组') && e.children.length < 3) push(e, 'HEAD_TITLE');
    });
    document.querySelectorAll('.ud__card, [class*="shadow-md"], [class*="card"]').forEach(el => push(el, 'CARD'));
    document.querySelectorAll('.ud__form__item, [class*="form__item"]').forEach(el => push(el, 'FORM_ITEM'));
    document.querySelectorAll('input, .ud__select, .ud__picker, textarea').forEach(el => push(el, 'INPUT'));
    // radio（关键：人员范围设置方式禁用态）
    document.querySelectorAll('.ud__radio__wrapper, [class*="radio"]').forEach(el => push(el, 'RADIO'));
    document.querySelectorAll('.ud__switch, [class*="switch"]').forEach(el => push(el, 'SWITCH'));
    document.querySelectorAll('.ud__checkbox__wrapper, [class*="checkbox"]').forEach(el => push(el, 'CHECKBOX'));
    document.querySelectorAll('button').forEach(el => push(el, 'BUTTON'));
    return out;
  });
  fs.writeFileSync(path.join(OUT, 'semester-edit-form-struct.json'), JSON.stringify(struct, null, 1), 'utf8');
  log('FORM STRUCT nodes:', struct.nodes.length);

  // 文本
  const txt = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(path.join(OUT, 'semester-edit-form-text.txt'), txt, 'utf8');

  // 截图
  await page.screenshot({ path: path.join(OUT, 'semester-edit-form-top.png') }).catch(e => log('shot1 err', e.message));
  const fullH = await page.evaluate(() => document.body.scrollHeight);
  log('body height:', fullH);
  if (fullH > 800) await page.screenshot({ path: path.join(OUT, 'semester-edit-form-full.png'), fullPage: true }).catch(e => log('shot2 err', e.message));

  // 接口（info + 编辑表单相关）
  const apiLog = [];
  const onResp = async (resp) => {
    const u = resp.url();
    if (/\/perf\/api\//.test(u) && resp.request().method() === 'GET') {
      let body = '';
      try { body = await resp.text(); } catch {}
      if (/follow\/group\/info|resolve-scope\/meta|custom_org_type|communication_stages|activities_v2|user\/query|department\/tree/.test(u)) {
        apiLog.push({ url: u.replace(/^https:\/\/idreamsky\.feishu\.cn/, ''), status: resp.status(), len: body.length, body: body.slice(0, 1500) });
      }
    }
  };
  page.on('response', onResp);
  await page.reload({ waitUntil: 'networkidle' }).catch(e => log('reload err', e.message));
  await page.waitForTimeout(1500);
  page.off('response', onResp);
  fs.writeFileSync(path.join(OUT, 'semester-edit-form-api.json'), JSON.stringify(apiLog, null, 1), 'utf8');
  apiLog.forEach(a => log('  API', a.url.slice(0, 110), a.status, a.len));

  await browser.close().catch(() => {});
  log('DONE');
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
