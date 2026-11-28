/* REA 抓取：绩效后台-权限管理-角色配置-评估角色页 + 添加评估角色弹窗
 * 用法: node capture-role-add-dialog.js
 * 产出: out/role-add-dialog/*
 */
process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out', 'role-add-dialog');
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('feishu.cn'));
  if (!page) throw new Error('no feishu page');
  log('CURRENT', page.url());

  const dumpEl = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName, cls: (el.className || '').toString().slice(0, 160),
      rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      text: (el.textContent || '').trim().slice(0, 40),
      st: {
        color: cs.color, backgroundColor: cs.backgroundColor, borderColor: cs.borderColor,
        borderWidth: cs.borderWidth, borderRadius: cs.borderRadius, padding: cs.padding,
        fontSize: cs.fontSize, fontWeight: cs.fontWeight, lineHeight: cs.lineHeight,
        margin: cs.margin, display: cs.display, cursor: cs.cursor, boxShadow: cs.boxShadow,
        fontFamily: cs.fontFamily.slice(0, 80),
      },
    };
  };

  // 1) 页头区：提示条 + 添加按钮 + 筛选按钮
  const pageHead = await page.evaluate((dumpElStr) => {
    const dumpEl = eval('(' + dumpElStr + ')');
    const byText = (t) => {
      const all = [...document.querySelectorAll('*')].filter(el => el.children.length === 0 && (el.textContent || '').trim() === t && el.getBoundingClientRect().width > 0);
      return all[0] || null;
    };
    const hint = byText('评估角色可以在绩效模板中被设为环节执行人');
    const addBtn = byText('添加评估角色');
    const filterBtn = byText('筛选');
    const hintParent = hint ? hint.closest('[class]') : null;
    const addBtnParent = addBtn ? addBtn.closest('button') || addBtn.parentElement : null;
    const btnTree = (btn) => {
      if (!btn) return null;
      const chain = [];
      let n = btn;
      for (let i = 0; i < 6 && n; i++) { chain.push(dumpEl(n)); n = n.parentElement; }
      return chain;
    };
    const hintTree = hint ? (() => { const c = []; let n = hint; for (let i = 0; i < 8 && n; i++) { c.push(dumpEl(n)); n = n.parentElement; } return c; })() : null;
    const result = {
      hintText: hint ? hint.textContent.trim() : null,
      hintTree,
      addBtn: dumpEl(addBtnParent || addBtn),
      addBtnChain: btnTree(addBtnParent || addBtn),
      filterBtn: dumpEl(filterBtnParent(filterBtn)),
      filterBtnChain: filterBtn ? btnTree(filterBtn.closest('button') || filterBtn.parentElement) : null,
    };
    function filterBtnParent(b) { return b; }
    return result;
  }, dumpEl.toString());
  fs.writeFileSync(path.join(OUT, '01-page-head.json'), JSON.stringify(pageHead, null, 2), 'utf8');
  log('HINT', pageHead.hintText);
  log('ADD_BTN', JSON.stringify(pageHead.addBtn && { cls: pageHead.addBtn.cls, rect: pageHead.addBtn.rect }));

  await page.screenshot({ path: path.join(OUT, '00-page.png') });

  // 2) 点击 添加评估角色
  const clicked = await page.evaluate(() => {
    const addBtn = [...document.querySelectorAll('button')].find(el => (el.textContent || '').trim() === '添加评估角色' && el.getBoundingClientRect().width > 0);
    if (!addBtn) return false;
    addBtn.click();
    return true;
  });
  log('CLICK_ADD', clicked);
  if (!clicked) throw new Error('未找到添加评估角色按钮');
  await page.waitForTimeout(1800);

  // 3) 抓弹窗
  const dialog = await page.evaluate(() => {
    // 找弹窗容器：含固定定位/遮罩层，或 class 含 modal/dialog
    const candidates = [...document.querySelectorAll('div')].filter(el => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (cs.position === 'fixed' || cs.position === 'absolute') && r.width > 300 && r.height > 200;
    });
    const modalLayer = candidates.find(el => getComputedStyle(el).position === 'fixed' && getComputedStyle(el).zIndex > 1000 && el.querySelector('input, textarea')) || null;
    // 全页按钮/输入/文本（新增弹窗上下文）
    const allBtns = [...document.querySelectorAll('button')].filter(el => el.getBoundingClientRect().width > 0).map(el => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { t: (el.textContent || '').trim().slice(0, 16), x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), cls: (el.className || '').toString().slice(0, 90), bg: cs.backgroundColor, c: cs.color, border: cs.borderColor, radius: cs.borderRadius, disabled: el.disabled || cs.cursor === 'not-allowed', fontWeight: cs.fontWeight };
    });
    const inputs = [...document.querySelectorAll('input, textarea')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map(el => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { tag: el.tagName, t: (el.placeholder || '').slice(0, 30), x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), cls: (el.className || '').toString().slice(0, 90), readonly: el.readOnly || el.disabled, border: cs.borderColor, bg: cs.backgroundColor, radius: cs.borderRadius };
    });
    const labels = [...document.querySelectorAll('div,span,label,h1,h2,h3')].filter(el => {
      const r = el.getBoundingClientRect(); const t = (el.textContent || '').trim();
      return t && t.length < 40 && r.width > 0 && r.height > 0 && el.children.length === 0;
    }).map(el => ({ t: (el.textContent || '').trim(), x: +el.getBoundingClientRect().x.toFixed(1), y: +el.getBoundingClientRect().y.toFixed(1) }));
    return { modalLayerFound: !!modalLayer, allBtns, inputs, labels };
  });
  fs.writeFileSync(path.join(OUT, '02-dialog.json'), JSON.stringify(dialog, null, 2), 'utf8');
  await page.screenshot({ path: path.join(OUT, '03-dialog.png') });
  log('DIALOG_BTNS', JSON.stringify(dialog.allBtns.map(b => b.t + '@' + b.x + ',' + b.y + (b.disabled ? '(d)' : '') + ' ' + b.cls.slice(0, 60))));
  log('DIALOG_INPUTS', JSON.stringify(dialog.inputs));
  log('DIALOG_LABELS', JSON.stringify(dialog.labels.slice(0, 30)));

  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
