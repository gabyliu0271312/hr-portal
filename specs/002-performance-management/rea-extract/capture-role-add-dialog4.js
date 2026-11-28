/* REA 抓取 4：页面头部「添加评估角色」按钮链路 + 是否含加号图标
 * 用法: node capture-role-add-dialog4.js
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

  // 确保弹窗关闭（若开则关）
  await page.evaluate(() => {
    const esc = document.querySelector('.perf-web__ud__modal__content .perf-web__ud__button--icon');
    if (esc) esc.click();
  }).catch(() => {});
  await page.waitForTimeout(800);

  const addBtn = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(el => (el.textContent || '').trim() === '添加评估角色' && el.getBoundingClientRect().width > 0);
    if (!btn) return { found: false };
    const chain = [];
    let n = btn;
    for (let i = 0; i < 7 && n; i++) {
      const r = n.getBoundingClientRect(); const cs = getComputedStyle(n);
      chain.push({
        tag: n.tagName.toLowerCase(),
        cls: (n.className && n.className.toString ? n.className.toString().slice(0, 110) : ''),
        rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
        t: (n.textContent || '').trim().slice(0, 16),
        st: { bg: cs.backgroundColor, color: cs.color, border: cs.borderColor, radius: cs.borderRadius, pad: cs.padding, fs: cs.fontSize, fw: cs.fontWeight, lh: cs.lineHeight, display: cs.display, align: cs.alignItems, gap: cs.gap },
      });
      n = n.parentElement;
    }
    const svg = [...btn.querySelectorAll('svg')].map(s => { const r = s.getBoundingClientRect(); return { w: r.width, h: r.height, inner: s.innerHTML.slice(0, 120) }; });
    const hasAddIcon = (btn.textContent || '').trim() === '添加评估角色' && btn.querySelector('svg') !== null;
    return { found: true, chain, svg, hasAddIcon };
  });
  fs.writeFileSync(path.join(OUT, '12-add-button-chain.json'), JSON.stringify(addBtn, null, 2), 'utf8');
  log('ADD_BTN_FOUND', addBtn.found, 'hasIcon', addBtn.hasAddIcon);
  log('CHAIN', JSON.stringify(addBtn.chain && addBtn.chain.map(c => c.tag + '.' + (c.cls.split(' ').slice(0, 3).join('.') || '') + ' ' + c.rect.x + ',' + c.rect.y + ' ' + c.rect.w + 'x' + c.rect.h)));
  if (addBtn.svg && addBtn.svg.length) log('SVG', JSON.stringify(addBtn.svg.map(s => ({ w: s.w, h: s.h, inner: s.inner }))));
  await page.screenshot({ path: path.join(OUT, '13-page-current.png') });

  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
