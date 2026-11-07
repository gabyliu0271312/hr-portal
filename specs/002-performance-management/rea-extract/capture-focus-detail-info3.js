/* 补采：周期版详情页「基本信息」字段区完整 DOM（字段行布局 + overflow 处理）
 * 页面当前已停在 management/7669998387978046396
 */
process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out', 'focus-edit', 'detail-info');
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctxs = browser.contexts();
  let page = null;
  for (const ctx of ctxs) for (const p of ctx.pages()) {
    if (/idreamsky\.feishu\.cn\/perf\/admin/.test(p.url())) page = p;
  }
  if (!page) { log('NO_PERF_PAGE'); process.exit(2); }
  log('URL:', page.url());
  await page.waitForTimeout(800);

  // 采集基本信息卡片字段区完整 DOM 树（含每节点样式）
  const card = await page.evaluate(() => {
    const out = { viewport: [innerWidth, innerHeight], nodes: [] };
    // 定位卡片：px-10 pt-10 rounded-8 bg-white 容器
    const cards = Array.from(document.querySelectorAll('div')).filter(el => {
      const c = String(el.className || '');
      return c.includes('px-10') && c.includes('rounded-8') && c.includes('bg-white');
    });
    const card = cards[0];
    if (!card) return out;
    out.outer = card.outerHTML.slice(0, 4000);

    const seen = new Set();
    const push = (el, label) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const cs = getComputedStyle(el);
      out.nodes.push({
        label, tag: el.tagName, cls: String(el.className || '').slice(0, 60),
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        display: cs.display, flex: `${cs.flexDirection}|${cs.justifyContent}|${cs.alignItems}`,
        gap: cs.gap, gridTemplate: cs.gridTemplateColumns.slice(0, 80),
        overflow: cs.overflow, textOverflow: cs.textOverflow, whiteSpace: cs.whiteSpace,
        fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color, lineHeight: cs.lineHeight,
        pad: cs.padding, margin: cs.margin,
        text: (el.innerText || '').trim().replace(/\n/g, '|').slice(0, 60)
      });
    };
    // 递归遍历卡片所有后代，打印叶子和结构节点
    const walk = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) { for (const c of el.children) walk(c); return; }
      if (el.children.length <= 3 || el === card) push(el, 'NODE');
      for (const c of el.children) walk(c);
    };
    walk(card);
    out.nodes.sort((a, b) => a.rect[1] - b.rect[1] || a.rect[0] - b.rect[0]);
    return out;
  });
  fs.writeFileSync(path.join(OUT, 'detail-info-card.json'), JSON.stringify(card, null, 1), 'utf8');
  log('card nodes:', card.nodes.length);

  // 打印字段行（每行 y 分组）
  const rows = {};
  for (const n of card.nodes) {
    const y = n.rect[1];
    if (!rows[y]) rows[y] = [];
    rows[y].push(`${n.label}:${n.tag}[${n.cls}]@${n.rect[0]},${n.rect[2]}w "${n.text}" OV=${n.overflow}/${n.textOverflow}/${n.whiteSpace} F=${n.flex} G=${n.gap}`);
  }
  for (const y of Object.keys(rows).sort((a,b)=>a-b)) {
    console.log(`y=${y}:`);
    rows[y].forEach(l => console.log('   ', l.slice(0, 150)));
  }

  await browser.close().catch(() => {});
  log('DONE');
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
