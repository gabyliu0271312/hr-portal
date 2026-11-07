/* REA 编辑链路采集 6：编辑表单像素级计算样式（token 对照用）
 * 名称输入 / 说明输入 / 关联项目 select / checkbox / 按钮 / footer / 卡片 完整计算样式
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

  const out = await page.evaluate(() => {
    const g = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        tag: el.tagName, cls: String(el.className || '').slice(0, 100),
        fontSize: cs.fontSize, fontWeight: cs.fontWeight, lineHeight: cs.lineHeight, color: cs.color,
        bg: cs.backgroundColor, border: cs.border, borderTop: cs.borderTopWidth + ' ' + cs.borderTopColor,
        borderRight: cs.borderRightWidth + ' ' + cs.borderRightColor,
        borderBottom: cs.borderBottomWidth + ' ' + cs.borderBottomColor,
        borderLeft: cs.borderLeftWidth + ' ' + cs.borderLeftColor,
        radius: cs.borderRadius, padding: cs.padding, margin: cs.margin,
        boxShadow: cs.boxShadow.slice(0, 120),
        position: cs.position, display: cs.display, flex: cs.flexDirection + ' ' + cs.justifyContent + ' ' + cs.alignItems,
        gap: cs.gap, whiteSpace: cs.whiteSpace,
        text: (el.innerText || '').trim().slice(0, 30)
      };
    };
    const q = (sel) => document.querySelector(sel);
    const out = {};
    // 输入框本体（名称/说明的语言输入内层）
    out.nameInput = g(document.querySelector('.ud__form__item .ud__input, .ud__form__item input').closest('.ud__input, [class*="input-wrap"]'));
    out.nameInputWrap = g(document.querySelector('.ud__form__item [class*="input-wrap"], .ud__form__item .ud__input-input-wrap'));
    // 语言 tag
    out.langTag = g(document.querySelector('[class*="lang-tag"], .ud__tag'));
    // 添加英文按钮
    const addBtn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('添加英文'));
    out.addBtn = g(addBtn);
    // 关联项目 select
    const sel = Array.from(document.querySelectorAll('.ud__select')).find(s => (s.innerText || '').trim().length > 0);
    out.projectSelect = g(sel);
    out.projectSelector = g(document.querySelector('.ud__select__selector'));
    // 已选 tag 内文本
    out.projectValue = g(document.querySelector('.ud__select__selection__item, .ud__select__content, .ud__select__placeholder, .ud__select__selected'));
    // checkbox
    out.checkboxWrapper = g(q('.ud__checkbox__wrapper'));
    out.checkboxInput = g(q('.ud__checkbox__input'));
    out.checkboxWallpaper = g(q('.ud__checkbox__wallpaper'));
    out.checkboxLabel = g(q('.ud__checkbox__label-content'));
    // 卡片
    out.card1 = g(q('.p-10.rounded-8.bg-white.ud__card--shadow-md'));
    out.card2 = g(q('.p-10.rounded-8.bg-white.ud__card--shadow-md.mt-8'));
    // head
    out.head = g(q('.indexstyled__ModalHeader'));
    out.headTitle = g(Array.from(document.querySelectorAll('[class*="ModalTitle"]'))[0]);
    out.headBack = g(Array.from(document.querySelectorAll('[class*="GoBack"]'))[0]);
    // footer
    out.footer = g(Array.from(document.querySelectorAll('[class*="absolute"],[class*="sticky"]')).find(e => { const r = e.getBoundingClientRect(); return r.y > innerHeight - 80 && r.height > 30 && (e.innerText || '').includes('确定'); }));
    out.confirmBtn = g(Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').trim() === '确定'));
    out.cancelBtn = g(Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').trim() === '取消'));
    // 表单 label
    const labels = Array.from(document.querySelectorAll('.ud__form__item__label, [class*="form__item__label"]'));
    out.formLabels = labels.slice(0, 6).map(l => g(l));
    return out;
  });
  fs.writeFileSync(path.join(OUT, 'edit-styles.json'), JSON.stringify(out, null, 1), 'utf8');
  log('DONE styles collected');
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
