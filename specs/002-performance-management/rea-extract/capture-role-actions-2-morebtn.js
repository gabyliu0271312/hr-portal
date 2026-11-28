process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'out', 'role-add-dialog');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('feishu.cn'));
  if (!page) { console.log('NO_PAGE'); return; }
  // 第 1 行（自定义角色）操作列区域 x 2940-3400, y 334-376 的所有元素
  const area = await page.evaluate(() => {
    const out = [];
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(0), y: +r.y.toFixed(0), w: +r.width.toFixed(0), h: +r.height.toFixed(0) }; };
    [...document.querySelectorAll('*')].forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      if (r.x >= 2930 && r.y >= 330 && r.y <= 382) {
        const cs = getComputedStyle(el);
        const svgs = [...el.querySelectorAll('svg')].map(s => { const sr = s.getBoundingClientRect(); return { w: sr.width, h: sr.height, path: s.innerHTML.slice(0, 60) }; });
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && el.className.toString ? el.className.toString().slice(0, 80) : ''),
          t: (el.textContent || '').trim().slice(0, 10),
          rect: rect(el),
          cursor: cs.cursor, role: el.getAttribute('role'), aria: el.getAttribute('aria-label'), title: el.getAttribute('title'),
          svgs,
        });
      }
    });
    return out;
  });
  fs.writeFileSync(path.join(OUT, '24-row1-actions-full.json'), JSON.stringify(area, null, 2), 'utf8');
  console.log('COUNT', area.length);
  area.slice(0, 40).forEach(a => console.log(a.tag, a.cls.split(' ').slice(0, 4).join('.'), JSON.stringify(a.rect), 'role=' + a.role, 'aria=' + a.aria, 'cursor=' + a.cursor, 't=' + a.t, 'svg=' + (a.svgs && a.svgs.length ? a.svgs.map(s => s.w + 'x' + s.h + ':' + s.path).join('|') : '')));
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
