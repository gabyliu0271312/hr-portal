/* REA 编辑链路采集 4：编辑态禁用/交互行为确认
 * - 关联评估项目下拉：点击是否展开（确认可改/禁改）
 * - 角色 checkbox：勾选态 + 是否可点击
 * - 名称/说明 input：disabled 属性
 * - 新增英文按钮：是否可用
 * - 各字段计算样式细节（border/padding/font）
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
  await page.waitForTimeout(500);

  const result = {};

  // ===== 1) 字段禁用/交互状态 =====
  result.fields = await page.evaluate(() => {
    const getInfo = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName, cls: String(el.className || '').slice(0, 90),
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        disabled: el.disabled === true,
        ariaDisabled: el.getAttribute('aria-disabled'),
        readOnly: el.readOnly === true,
        tabIndex: el.getAttribute('tabindex'),
        pointerEvents: cs.pointerEvents, cursor: cs.cursor,
        opacity: cs.opacity,
        isSelect: !!el.querySelector('.ud__select'),
        text: (el.innerText || '').trim().slice(0, 30)
      };
    };
    const out = {};
    // 名称 input
    const nameInput = document.querySelectorAll('.ud__form__item input').length >= 1 ? Array.from(document.querySelectorAll('.ud__form__item input'))[0] : null;
    if (nameInput) out.nameInput = getInfo(nameInput.closest('.ud__form__item') || nameInput);
    // 关联评估项目 select
    const projSel = Array.from(document.querySelectorAll('.ud__select')).find(s => (s.innerText || '').includes('2026年半年度绩效评估') || (s.innerText || '').trim());
    if (projSel) out.projectSelect = getInfo(projSel.closest('.ud__form__item') || projSel);
    // 角色 checkbox 组
    const checks = Array.from(document.querySelectorAll('.ud__checkbox__wrapper'));
    out.checkboxes = checks.map(c => ({
      ...getInfo(c),
      checked: !!(c.querySelector('.ud__checkbox__input') && c.querySelector('.ud__checkbox__input').checked)
    }));
    // 添加英文按钮
    const addBtns = Array.from(document.querySelectorAll('button')).filter(b => (b.innerText || '').includes('添加英文'));
    out.addEnglishBtns = addBtns.map(b => getInfo(b));
    return out;
  });

  // ===== 2) 点击关联评估项目下拉，看是否展开 =====
  const projSelRect = await page.evaluate(() => {
    const sels = Array.from(document.querySelectorAll('.ud__select'));
    for (const s of sels) {
      const r = s.getBoundingClientRect();
      if (r.width > 500 && r.width < 900 && r.height > 25 && r.height < 40 && r.top > 50) {
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) };
      }
    }
    return null;
  });
  log('project select rect:', JSON.stringify(projSelRect));
  if (projSelRect) {
    await page.mouse.click(projSelRect.x, projSelRect.y);
    await page.waitForTimeout(1200);
    // 检查下拉是否出现
    result.dropdownOpen = await page.evaluate(() => {
      const dd = document.querySelector('.ud__select__dropdown, [class*="dropdown"], [class*="popover"], [class*="select-option"]');
      if (!dd) return { open: false };
      const r = dd.getBoundingClientRect();
      const cs = getComputedStyle(dd);
      return { open: true, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], cls: String(dd.className).slice(0, 90), text: (dd.innerText || '').trim().slice(0, 150), display: cs.display, visibility: cs.visibility };
    });
    log('dropdown:', JSON.stringify(result.dropdownOpen));
    // 截图下拉
    await page.screenshot({ path: path.join(OUT, 'edit-project-dropdown.png') }).catch(e => log('shot err', e.message));
    // 关闭
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);
  }

  // ===== 3) 点 checkbox 看能否切换（确认可交互） =====
  const cbRect = await page.evaluate(() => {
    const cb = document.querySelector('.ud__checkbox__wrapper');
    if (!cb) return null;
    const r = cb.getBoundingClientRect();
    return { x: Math.round(r.x + 8), y: Math.round(r.y + 11) };
  });
  log('checkbox click at:', JSON.stringify(cbRect));
  if (cbRect) {
    await page.mouse.click(cbRect.x, cbRect.y);
    await page.waitForTimeout(500);
    result.checkboxToggled = await page.evaluate(() => {
      const checks = Array.from(document.querySelectorAll('.ud__checkbox__wrapper'));
      return checks.map(c => ({ text: (c.innerText || '').trim().slice(0, 20), checked: !!(c.querySelector('.ud__checkbox__input') && c.querySelector('.ud__checkbox__input').checked) }));
    });
    log('after toggle:', JSON.stringify(result.checkboxToggled));
    // 恢复不勾
    const cur = await page.evaluate(() => {
      const c = document.querySelector('.ud__checkbox__wrapper .ud__checkbox__input');
      return c ? c.checked : null;
    });
    if (cur) {
      await page.mouse.click(cbRect.x, cbRect.y);
      await page.waitForTimeout(300);
    }
  }

  fs.writeFileSync(path.join(OUT, 'edit-interactions.json'), JSON.stringify(result, null, 1), 'utf8');
  log('DONE');
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
