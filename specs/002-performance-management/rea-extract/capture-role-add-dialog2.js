/* REA 抓取 2：弹窗容器结构(head/body/footer) + 提示条样式 + 添加英文字段展开
 * 用法: node capture-role-add-dialog2.js
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

  // 若弹窗未开则打开
  const hasDialog = await page.evaluate(() => {
    return [...document.querySelectorAll('*')].some(el => (el.textContent || '').trim() === '名称' && el.getBoundingClientRect().width > 0);
  });
  if (!hasDialog) {
    log('REOPEN');
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(el => (el.textContent || '').trim() === '添加评估角色');
      b && b.click();
    });
    await page.waitForTimeout(1500);
  }

  // A) 弹窗容器结构树
  const modalInfo = await page.evaluate(() => {
    const titleEl = [...document.querySelectorAll('*')].find(el => (el.textContent || '').trim() === '添加评估角色' && el.children.length === 0 && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().y > 300);
    if (!titleEl) return { found: false };
    // 沿祖先找 fixed 弹窗容器
    let modal = titleEl;
    while (modal && modal !== document.body) {
      const cs = getComputedStyle(modal);
      if (cs.position === 'fixed' && modal.getBoundingClientRect().width > 300) break;
      modal = modal.parentElement;
    }
    if (!modal || modal === document.body) return { found: false };
    const pick = (el, depth) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        d: depth,
        tag: el.tagName.toLowerCase(),
        cls: (el.className && el.className.toString ? el.className.toString().slice(0, 110) : ''),
        rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
        t: (el.textContent || '').trim().slice(0, 24),
        st: cs.position === 'static' ? undefined : {
          position: cs.position, bg: cs.backgroundColor, color: cs.color, border: cs.borderColor,
          radius: cs.borderRadius, pad: cs.padding, shadow: cs.boxShadow.slice(0, 120), fs: cs.fontSize, fw: cs.fontWeight,
        },
      };
    };
    // 弹窗的直接子结构（2 层内）: header/body/footer
    const children = [...modal.children].map((ch, i) => {
      const c0 = pick(ch, 1);
      c0.kids = [...ch.children].slice(0, 12).map(k => pick(k, 2));
      return c0;
    });
    // 全弹窗祖先链样式（遮罩层）
    const ancestors = [];
    let n = modal.parentElement;
    let depth = 1;
    while (n && n !== document.body && depth <= 4) {
      ancestors.push(pick(n, depth)); n = n.parentElement; depth++;
    }
    return { found: true, modalCls: (modal.className || '').toString(), modalRect: pick(modal, 0).rect, children, ancestors };
  });
  fs.writeFileSync(path.join(OUT, '04-dialog-structure.json'), JSON.stringify(modalInfo, null, 2), 'utf8');
  log('MODAL', modalInfo.found, modalInfo.modalRect && JSON.stringify(modalInfo.modalRect));

  // B) 提示条样式 + 添加按钮样式
  const head = await page.evaluate(() => {
    const leafOf = (t) => [...document.querySelectorAll('*')].filter(el => el.children.length === 0 && (el.textContent || '').trim() === t && el.getBoundingClientRect().width > 0)[0] || null;
    const chain = (el, n) => { const c = []; let x = el; for (let i = 0; i < n && x; i++) { const r = x.getBoundingClientRect(); const cs = getComputedStyle(x); c.push({ tag: x.tagName.toLowerCase(), cls: (x.className || '').toString().slice(0, 90), rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }, st: { bg: cs.backgroundColor, color: cs.color, border: cs.borderColor, radius: cs.borderRadius, pad: cs.padding, fs: cs.fontSize, fw: cs.fontWeight, lh: cs.lineHeight, display: cs.display, align: cs.alignItems } }); x = x.parentElement; } return c; };
    const hint = leafOf('评估角色可以在绩效模板中被设为环节执行人');
    const addBtn = leafOf('添加评估角色');
    const addBtnEl = addBtn ? (addBtn.tagName === 'BUTTON' ? addBtn : addBtn.closest('button')) : null;
    return {
      hint: hint ? chain(hint, 6) : null,
      addBtn: addBtnEl ? chain(addBtnEl, 5) : null,
    };
  });
  fs.writeFileSync(path.join(OUT, '05-head-styles.json'), JSON.stringify(head, null, 2), 'utf8');
  log('HEAD', !!head.hint, !!head.addBtn);

  // C) 点击第一个「添加英文」，看展开的英文字段
  const engClicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(el => (el.textContent || '').trim() === '添加英文' && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().y > 300);
    if (!b) return false;
    b.click(); return true;
  });
  log('CLICK_ENG', engClicked);
  await page.waitForTimeout(900);

  const engForm = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('div,span,label')].filter(el => {
      const r = el.getBoundingClientRect(); const t = (el.textContent || '').trim();
      return t && t.length < 24 && r.width > 0 && r.height > 0 && el.children.length === 0 && r.y > 300;
    }).map(el => ({ t: (el.textContent || '').trim(), x: +el.getBoundingClientRect().x.toFixed(1), y: +el.getBoundingClientRect().y.toFixed(1) }));
    const inputs = [...document.querySelectorAll('input, textarea')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.y > 300; }).map(el => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { tag: el.tagName, t: (el.placeholder || '').slice(0, 20), x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), border: cs.borderColor, bg: cs.backgroundColor, radius: cs.borderRadius };
    });
    return { labels, inputs };
  });
  fs.writeFileSync(path.join(OUT, '06-dialog-eng-expanded.json'), JSON.stringify(engForm, null, 2), 'utf8');
  await page.screenshot({ path: path.join(OUT, '07-dialog-eng-expanded.png') });
  log('ENG_FORM', JSON.stringify(engForm.labels.slice(0, 16)));
  log('ENG_INPUTS', JSON.stringify(engForm.inputs));

  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
