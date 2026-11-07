/* REA 编辑链路采集 10：周期版编辑表单字段级禁用态 + 保存 payload
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
    if (/\/focus-people\/edit\/[0-9]+/.test(p.url())) page = p;
  }
  if (!page) { log('NO_EDIT_PAGE'); await browser.close().catch(() => {}); process.exit(2); }
  await page.waitForTimeout(500);

  // 字段级状态
  const fields = await page.evaluate(() => {
    const gi = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        cls: String(el.className || '').slice(0, 100),
        disabled: el.disabled === true, ariaDisabled: el.getAttribute('aria-disabled'),
        pe: cs.pointerEvents, cur: cs.cursor, opacity: cs.opacity,
        readOnly: el.readOnly === true, tabIndex: el.getAttribute('tabindex'),
        text: (el.innerText || '').trim().slice(0, 40)
      };
    };
    const out = {};
    // 关注人 select
    const fSel = Array.from(document.querySelectorAll('.ud__select')).find(s => (s.innerText || '').includes('alice.xiao') || (s.innerText || '').includes('肖惠方'));
    if (fSel) out.followeeSelect = gi(fSel.closest('.ud__form__item') || fSel);
    // 标签颜色
    const colorEl = Array.from(document.querySelectorAll('*')).find(e => (e.innerText || '').trim() === '标签颜色' && e.children.length === 0);
    if (colorEl) {
      let wrap = colorEl.closest('.ud__form__item');
      out.tagColor = wrap ? gi(wrap) : gi(colorEl.parentElement);
      // 色板/选择器
      const palette = wrap ? wrap.querySelectorAll('.ud__radio, [class*="color"], [class*="palette"], input') : null;
      if (palette) out.tagColorControls = Array.from(palette).slice(0, 10).map(p => gi(p));
    }
    // 人员范围设置 radio 组（确认组级禁改）
    const radioGroup = document.querySelectorAll('.ud__radio-group--direction-vertical, .ud__radio-group--mode-solid');
    out.radioGroups = Array.from(radioGroup).map(g => gi(g));
    // 角色 checkbox 组
    const cbs = document.querySelectorAll('.ud__checkbox__wrapper');
    out.checkboxes = Array.from(cbs).map(c => ({
      ...gi(c),
      checked: !!(c.querySelector('.ud__checkbox__input') && c.querySelector('.ud__checkbox__input').checked),
      disabledCls: String(c.className).includes('disable')
    }));
    // 名称/说明输入
    const inputs = Array.from(document.querySelectorAll('.ud__form__item .ud__input, .ud__form__item [class*="input-wrap"]'));
    out.inputs = inputs.slice(0, 4).map(i => gi(i));
    return out;
  });
  fs.writeFileSync(path.join(OUT, 'semester-edit-fields.json'), JSON.stringify(fields, null, 1), 'utf8');
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) { console.log(k + ':'); v.forEach(x => console.log('  ', JSON.stringify(x).slice(0, 230))); }
    else console.log(k, JSON.stringify(v).slice(0, 230));
  }

  // 拦截 edit POST
  const postLog = [];
  await page.route('**/perf/api/**', async route => {
    const req = route.request();
    const u = req.url();
    if (req.method() === 'POST' && /follow\/group\/edit/.test(u)) {
      let body = '';
      try { body = req.postData() || ''; } catch {}
      postLog.push({ url: u, body });
      log('INTERCEPT EDIT:', u.replace(/^https:\/\/idreamsky\.feishu\.cn/, ''));
      log('  PAYLOAD:', body.slice(0, 1500));
      route.abort().catch(() => {});
    } else route.continue().catch(() => {});
  });

  const confirmBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    for (const b of btns) if ((b.innerText || '').trim() === '确定') { const r = b.getBoundingClientRect(); if (r.width > 0) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }
    return null;
  });
  log('confirm:', JSON.stringify(confirmBtn));
  if (confirmBtn) {
    await page.mouse.click(confirmBtn.x, confirmBtn.y);
    await page.waitForTimeout(2000);
    if (postLog.length === 0) log('NO_EDIT_INTERCEPTED');
  }
  fs.writeFileSync(path.join(OUT, 'semester-edit-post.json'), JSON.stringify(postLog, null, 1), 'utf8');

  await browser.close().catch(() => {});
  log('DONE');
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
