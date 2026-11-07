/* REA 编辑链路采集 2：点「编辑」按钮 → 进入编辑表单页 → 完整采集
 * 对齐新建表单采集格式：head / 字段 / 禁用态 / 几何 / 回显 / 截图
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
  await page.waitForTimeout(500);
  log('URL:', page.url());

  // ===== 点击「编辑」按钮 =====
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
  log('editBtn center:', JSON.stringify(editBtn));
  if (!editBtn) { log('NO_EDIT_BTN'); await browser.close().catch(() => {}); process.exit(2); }
  await page.mouse.click(editBtn.x, editBtn.y);
  await page.waitForTimeout(2500);

  log('AFTER_CLICK URL:', page.url());
  log('AFTER_CLICK title:', await page.title());

  // 等待新 URL（编辑页 focus-people/edit/ 或 activity-focus-people）
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(600);
    if (/\/focus-people\/edit\/|\/activity-focus-people\/[^/]+(\?|$)/.test(page.url())) break;
  }
  log('FINAL URL:', page.url());

  // ===== 采集编辑表单 =====
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
        label, tag: el.tagName, cls: String(el.className || '').slice(0, 120),
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        font: cs.fontSize + '/' + cs.fontWeight + ' ' + (cs.fontFamily || '').slice(0, 30),
        color: cs.color, bg: cs.backgroundColor,
        border: cs.borderBottomWidth + ' ' + cs.borderBottomColor,
        radius: cs.borderRadius,
        pad: cs.paddingTop + ' ' + cs.paddingRight + ' ' + cs.paddingBottom + ' ' + cs.paddingLeft,
        margin: cs.marginTop + ' ' + cs.marginRight + ' ' + cs.marginBottom + ' ' + cs.marginLeft,
        display: cs.display, gap: cs.gap, lineHeight: cs.lineHeight,
        disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
        text: (el.innerText || '').trim().slice(0, 40)
      });
    };
    // head
    const head = document.querySelector('.indexstyled__ModalHeader, [class*="ModalHeader"]');
    push(head, 'HEAD');
    Array.from(document.querySelectorAll('*')).forEach(e => {
      const t = (e.innerText || '').trim();
      if ((t === '返回' || t === '编辑人员组' || t === '新建人员组') && e.children.length < 3) push(e, 'HEAD_TEXT');
    });
    // 卡片
    document.querySelectorAll('.ud__card, [class*="shadow-md"], [class*="card"]').forEach(el => push(el, 'CARD'));
    // form items
    document.querySelectorAll('.ud__form__item, [class*="form__item"]').forEach(el => push(el, 'FORM_ITEM'));
    // label 文本
    document.querySelectorAll('.ud__form__label, [class*="form-label"], label').forEach(el => push(el, 'LABEL'));
    // 输入
    document.querySelectorAll('input, .ud__select, .ud__picker, textarea').forEach(el => push(el, 'INPUT'));
    // radio
    document.querySelectorAll('.ud__radio__wrapper, [class*="radio"]').forEach(el => push(el, 'RADIO'));
    // switch
    document.querySelectorAll('.ud__switch, [class*="switch"]').forEach(el => push(el, 'SWITCH'));
    // checkbox
    document.querySelectorAll('.ud__checkbox__wrapper, [class*="checkbox"]').forEach(el => push(el, 'CHECKBOX'));
    // 按钮
    document.querySelectorAll('button').forEach(el => push(el, 'BUTTON'));
    // 底部操作区
    document.querySelectorAll('[class*="sticky"], [class*="bottom"]').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.y > innerHeight - 100 && r.height > 30) push(el, 'FOOTER');
    });
    return out;
  });
  fs.writeFileSync(path.join(OUT, 'edit-struct.json'), JSON.stringify(struct, null, 1), 'utf8');
  log('EDIT STRUCT nodes:', struct.nodes.length);
  log('EDIT URL:', struct.url);

  // 全部文本
  const txt = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(path.join(OUT, 'edit-text.txt'), txt, 'utf8');

  // 截图
  await page.screenshot({ path: path.join(OUT, 'edit-top.png') }).catch(e => log('shot1 err', e.message));
  const fullH = await page.evaluate(() => document.body.scrollHeight);
  log('body height:', fullH);
  if (fullH > 800) {
    await page.screenshot({ path: path.join(OUT, 'edit-full.png'), fullPage: true }).catch(e => log('shot2 err', e.message));
  }

  await browser.close().catch(() => {});
  log('DONE');
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
