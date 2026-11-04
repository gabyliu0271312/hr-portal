/* REA 页面抓取脚本
 * 用法: node dump.js <url> [tag] [waitMs]
 * 产出(out/<tag>/):
 *   page.html      完整 DOM
 *   page.png       全页截图 (2x)
 *   network.json   所有网络响应清单
 *   api/*.json     JSON/文本响应体
 *   css/*.css      可访问的样式表
 *   scripts.txt    所有脚本 URL
 *   outline.json   结构概要 (标题/主要区块)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const url = process.argv[2] || 'https://idreamsky.feishu.cn/perf/admin/templates/7699791798989900738/4';
const tag = process.argv[3] || 'dump';
const maxWaitMs = Number(process.argv[4] || 300000);

const OUT = path.join(__dirname, 'out', tag);
fs.mkdirSync(path.join(OUT, 'api'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'css'), { recursive: true });

const network = [];
let apiCount = 0, cssCount = 0;

function safeName(u) {
  let s = u.replace(/^https?:\/\//, '').replace(/[?&#].*$/, '').replace(/[^a-zA-Z0-9._\/-]/g, '_');
  if (s.length > 120) s = s.slice(0, 60) + '__' + require('crypto').createHash('md5').update(u).digest('hex').slice(0, 10);
  return s.replace(/\//g, '__');
}

(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, 'profile'), {
    headless: false,
    viewport: { width: 1680, height: 950 },
    deviceScaleFactor: 2,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
  const page = await ctx.newPage();

  page.on('response', async (res) => {
    try {
      const req = res.request();
      const rt = req.resourceType();
      const ct = (res.headers()['content-type'] || '');
      const entry = { url: res.url(), status: res.status(), method: req.method(), type: rt, contentType: ct };
      // 保存 JSON / 文本响应体
      if ((ct.includes('json') || (ct.includes('text') && !ct.includes('html'))) && rt !== 'document') {
        try {
          const body = await res.body();
          if (body && body.length < 5 * 1024 * 1024) {
            let ext = ct.includes('json') ? 'json' : 'txt';
            const fn = `${String(apiCount).padStart(4, '0')}_${safeName(res.url())}.${ext}`;
            fs.writeFileSync(path.join(OUT, 'api', fn), body);
            entry.savedAs = `api/${fn}`;
            entry.size = body.length;
            apiCount++;
          }
        } catch (e) { /* body 不可得 */ }
      }
      network.push(entry);
    } catch (e) { /* ignore */ }
  });

  console.log('[goto]', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => console.log('[goto err]', e.message));

  // 等待登录完成: URL 含 /perf/admin 且页面文本足够长
  const t0 = Date.now();
  let logged = false;
  while (Date.now() - t0 < maxWaitMs) {
    const st = await page.evaluate(() => ({
      url: location.href,
      text: (document.body && document.body.innerText || '').length,
      title: document.title,
    })).catch(() => ({ url: '', text: 0, title: '' }));
    console.log('[poll]', st.url, 'textLen=', st.text, 'title=', st.title);
    if (/\/perf\/admin\//.test(st.url) && !/passport|login/.test(st.url) && st.text > 200) {
      logged = true;
      break;
    }
    await page.waitForTimeout(2500);
  }
  if (!logged) console.log('[warn] 等待超时，仍按当前状态落盘');

  // 渲染稳定等待
  await page.waitForTimeout(6000);
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch (e) {}

  // 落盘: 截图
  await page.screenshot({ path: path.join(OUT, 'page.png'), fullPage: true }).catch(e => console.log('[shot err]', e.message));
  await page.screenshot({ path: path.join(OUT, 'viewport.png'), fullPage: false }).catch(() => {});

  // 落盘: HTML
  const html = await page.content();
  fs.writeFileSync(path.join(OUT, 'page.html'), html);

  // 落盘: 结构概要
  const outline = await page.evaluate(() => {
    const pick = (el) => ({
      tag: el.tagName, id: el.id || undefined,
      cls: typeof el.className === 'string' ? el.className.slice(0, 200) : undefined,
      text: (el.innerText || '').slice(0, 100),
      rect: (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
    });
    const walk = (el, depth, acc) => {
      if (depth > 5 || acc.length > 800) return;
      const kids = [...el.children].filter(k => !['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT'].includes(k.tagName));
      for (const k of kids) {
        const r = k.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        acc.push({ depth, ...pick(k) });
        walk(k, depth + 1, acc);
      }
    };
    const acc = [];
    walk(document.body, 0, acc);
    return {
      title: document.title,
      url: location.href,
      viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
      scripts: [...document.querySelectorAll('script[src]')].map(s => s.src),
      links: [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.href),
      outline: acc,
    };
  });
  fs.writeFileSync(path.join(OUT, 'outline.json'), JSON.stringify(outline, null, 2));
  fs.writeFileSync(path.join(OUT, 'scripts.txt'), outline.scripts.concat(outline.links).join('\n'));

  // 落盘: CSS
  const cssInfo = await page.evaluate(async () => {
    const out = [];
    for (const ss of document.styleSheets) {
      const href = ss.href || '(inline)';
      try {
        const rules = [...ss.cssRules].map(r => r.cssText).join('\n');
        out.push({ href, css: rules });
      } catch (e) {
        if (ss.href) {
          try {
            const resp = await fetch(ss.href, { credentials: 'include' });
            const css = await resp.text();
            out.push({ href, css });
          } catch (e2) { out.push({ href, error: String(e2) }); }
        }
      }
    }
    return out;
  });
  for (const c of cssInfo) {
    if (!c.css) continue;
    fs.writeFileSync(path.join(OUT, 'css', `${String(cssCount).padStart(3, '0')}_${safeName(c.href)}.css`), c.css);
    cssCount++;
  }
  fs.writeFileSync(path.join(OUT, 'css-index.json'), JSON.stringify(cssInfo.map(c => ({ href: c.href, len: (c.css || '').length, error: c.error })), null, 2));

  fs.writeFileSync(path.join(OUT, 'network.json'), JSON.stringify(network, null, 2));
  console.log(`[done] tag=${tag} api=${apiCount} css=${cssCount} net=${network.length}`);
  console.log(`[keep] 浏览器保持打开 60 秒以便观察，随后自动关闭`);
  await page.waitForTimeout(60000);
  await ctx.close();
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
