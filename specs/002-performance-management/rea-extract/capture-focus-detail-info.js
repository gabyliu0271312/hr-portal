/* REA 补采：详情管理页「基本信息」卡片字段级 DOM
 * 目标：每行字段数（3 列？）、字段名/值布局、超长文本 overflow/ellipsis 处理
 * 从当前页面导航到周期版详情页 → 采集基本信息卡片完整 DOM 树 + 文本 + 截图
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
  if (!page) { log('NO_PERF_PAGE'); await browser.close().catch(() => {}); process.exit(2); }
  log('current URL:', page.url());

  // 1. 导航到周期版人员组列表页（tab=semester）
  const semesterId = '7654423719619710195';
  await page.goto(`https://idreamsky.feishu.cn/perf/admin/semester-activities/${semesterId}/focus-people?tab=semester&current=1&size=10`, { waitUntil: 'networkidle', timeout: 30000 }).catch(e => log('goto err', e.message));
  await page.waitForTimeout(1500);
  log('list URL:', page.url());

  // 2. 找到「核心管理干部」行的「编辑」按钮点击进入详情页
  const editBtn = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button, [class*="link"], a, [class*="action"]'));
    for (const el of els) {
      const txt = (el.innerText || '').trim();
      if (txt === '编辑') {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.y < 1000) {
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), row: Math.round(r.y) };
        }
      }
    }
    return null;
  });
  log('edit btn:', JSON.stringify(editBtn));
  if (editBtn) {
    await page.mouse.click(editBtn.x, editBtn.y);
    await page.waitForTimeout(1800);
  }
  log('detail URL:', page.url());

  // ========== 采集基本信息卡片字段级 DOM ==========
  const info = await page.evaluate(() => {
    const out = { viewport: [innerWidth, innerHeight], url: location.href, card: null, rows: [], text: '' };
    // 定位基本信息卡片：找文本「基本信息」的最近祖先卡片容器
    const findCard = () => {
      const els = Array.from(document.querySelectorAll('*'));
      for (const el of els) {
        if ((el.innerText || '').trim().split('\n')[0] === '基本信息' && el.children.length > 2) {
          // 向上找到带 padding/圆角/card 特征的最小容器
          let cur = el;
          for (let i = 0; i < 4 && cur; i++) {
            const cs = getComputedStyle(cur);
            if (parseFloat(cs.borderRadius) >= 4 && cur !== el) return cur;
            cur = cur.parentElement;
          }
          return el;
        }
      }
      return null;
    };
    const card = findCard();
    if (!card) return out;
    out.card = card.outerHTML.slice(0, 20000);
    out.text = card.innerText;

    // 字段行：卡片内所有 直接包含「字段名 + 值」的叶子文本节点对
    const seen = new Set();
    const leafText = (el) => {
      const direct = Array.from(el.childNodes)
        .filter(n => n.nodeType === 3)
        .map(n => n.textContent.trim()).join('');
      return direct;
    };
    const walk = (el) => {
      if (el.children.length === 0) return;
      const direct = leafText(el);
      if (direct && direct.length > 0 && el.children.length <= 6 && el.children.length >= 1) {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        const key = r.y + '_' + r.x + '_' + r.width;
        if (seen.has(key)) return;
        seen.add(key);
        out.rows.push({
          y: Math.round(r.y), x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height),
          cls: String(el.className || '').slice(0, 80),
          display: cs.display, flex: cs.flexDirection,
          overflow: cs.overflow, textOverflow: cs.textOverflow, whiteSpace: cs.whiteSpace,
          fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color, lineHeight: cs.lineHeight,
          text: direct.slice(0, 60),
          childrenCount: el.children.length
        });
      }
      for (const c of el.children) walk(c);
    };
    walk(card);
    // 按 y 排序输出
    out.rows.sort((a, b) => a.y - b.y || a.x - b.x);
    return out;
  });
  fs.writeFileSync(path.join(OUT, 'detail-info-struct.json'), JSON.stringify(info, null, 1), 'utf8');
  log('rows:', info.rows.length, 'text:', info.text.split('\n').slice(0, 20).join(' | '));

  // ========== 截图 ==========
  await page.screenshot({ path: path.join(OUT, 'detail-info-top.png') }).catch(e => log('shot err', e.message));

  await browser.close().catch(() => {});
  log('DONE');
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
