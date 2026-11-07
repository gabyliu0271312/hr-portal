/* 诊断：详情页基本信息卡片 DOM（当前页面已停在 management/7669998387978046396） */
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
  await page.waitForTimeout(1200);

  // 1. body 文本（诊断渲染状态）
  const bodyText = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(path.join(OUT, 'detail-body-text.txt'), bodyText, 'utf8');
  const lines = bodyText.split('\n').map(s => s.trim()).filter(s => s);
  log('BODY_TEXT top 40:');
  lines.slice(0, 40).forEach((l, i) => console.log('  ', i, JSON.stringify(l.slice(0, 70))));

  // 2. 找「基本信息」文本节点及其祖先链（打印每层 tag/class/rect/text）
  const cardInfo = await page.evaluate(() => {
    const out = [];
    const all = Array.from(document.querySelectorAll('*'));
    for (const el of all) {
      const direct = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
      if (direct === '基本信息') {
        const chain = [];
        let cur = el;
        for (let i = 0; i < 6 && cur; i++) {
          const r = cur.getBoundingClientRect();
          const cs = getComputedStyle(cur);
          chain.push({
            i, tag: cur.tagName,
            cls: String(cur.className || '').slice(0, 70),
            rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
            display: cs.display, radius: cs.borderRadius, pad: cs.padding,
            bg: cs.backgroundColor, childCount: cur.children.length,
            text: (cur.innerText || '').slice(0, 40).replace(/\n/g, '|')
          });
          cur = cur.parentElement;
        }
        out.push(chain);
      }
    }
    return out;
  });
  log('基本信息 ancestors:', JSON.stringify(cardInfo, null, 1).slice(0, 3000));
  fs.writeFileSync(path.join(OUT, 'detail-info-ancestors.json'), JSON.stringify(cardInfo, null, 1), 'utf8');

  // 3. 全页截图
  await page.screenshot({ path: path.join(OUT, 'detail-info-top.png') }).catch(e => log('shot err', e.message));

  await browser.close().catch(() => {});
  log('DONE');
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
