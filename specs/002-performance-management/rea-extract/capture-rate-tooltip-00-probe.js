/* 360°评估率 tooltip 提炼 - 00: 导航 + 页面结构概览
 * 用法：node capture-rate-tooltip-00-probe.js
 * 产出：out/rate-tooltip/00-probe.json + 截图
 */
process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = 'https://idreamsky.feishu.cn/perf/management/v2/7654423719619710195/7340285661313974274/all-projects/members';
const OUT = path.join(__dirname, 'out', 'rate-tooltip');
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  // 复用已有 feishu 页面
  let page = ctx.pages().find(p => p.url().includes('feishu.cn'));
  if (!page) { log('NO feishu page, opening new'); page = await ctx.newPage(); }
  log('current', page.url().slice(0, 140));

  const api = [];
  page.on('request', req => {
    const u = req.url();
    if (u.includes('/perf/api/') && !/\.(js|css|png|svg|woff|ico)/.test(u)) {
      api.push({ dir: 'REQ', m: req.method(), u: u.slice(0, 300), pd: (req.postData() || '').slice(0, 1200) });
    }
  });
  page.on('response', res => {
    const u = res.url();
    if (u.includes('/perf/api/') && !/\.(js|css|png|svg|woff|ico)/.test(u)) {
      res.text().then(txt => api.push({ dir: 'RES', st: res.status(), u: u.slice(0, 300), body: (txt || '').slice(0, 6000) })).catch(() => {});
    }
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  let waited = 0;
  while (waited < 150) {
    const t = await page.evaluate(() => document.body.innerText || '');
    if (/成员列表|成员|项目/.test(t) && t.length > 300) break;
    await page.waitForTimeout(3000); waited += 3;
  }
  await page.waitForTimeout(3000);
  log('LOADED', page.url());

  const probe = await page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    // 表头
    const headers = [...document.querySelectorAll('th, [class*=head], [class*=Head]')]
      .filter(el => { const rr = el.getBoundingClientRect(); return rr.width > 0 && rr.height > 10 && rr.y > 50 && rr.y < 400; })
      .map(el => ({ t: (el.textContent || '').trim().slice(0, 30), ...rect(el), cls: (el.className || '').toString().slice(0, 60) }))
      .filter(h => h.t);
    // 页面主要标题
    const titles = [...document.querySelectorAll('h1,h2,h3,[class*=title],[class*=Title]')]
      .filter(el => { const rr = el.getBoundingClientRect(); return rr.width > 0 && el.children.length <= 2; })
      .map(el => ({ t: (el.textContent || '').trim().slice(0, 60), ...rect(el), cls: (el.className || '').toString().slice(0, 60) }))
      .filter(x => x.t && x.w > 40);
    // 包含关键字的文本
    const key = ['360', '完成率', '评估率', '催办', '已评估', '未评估', '暂未邀请', '离职'];
    const hits = [...document.querySelectorAll('div,span,td,th')]
      .filter(el => { const rr = el.getBoundingClientRect(); const t = (el.textContent || '').trim(); return rr.width > 0 && rr.height > 0 && key.some(k => t.includes(k)) && el.children.length <= 3 && t.length < 60; })
      .map(el => ({ t: (el.textContent || '').trim().slice(0, 60), ...rect(el), cls: (el.className || '').toString().slice(0, 60) }))
      .slice(0, 40);
    return { url: location.href.slice(0, 140), headers, titles, keyHits: hits };
  });
  fs.writeFileSync(path.join(OUT, '00-probe.json'), JSON.stringify(probe, null, 1), 'utf8');
  await page.screenshot({ path: path.join(OUT, '00-probe.png') });
  log('headers', probe.headers.length, 'titles', probe.titles.length, 'keyHits', probe.keyHits.length);
  probe.headers.forEach(h => log('  H', h.t, h.x, h.y, h.w, h.h));
  probe.keyHits.forEach(h => log('  K', h.t, h.x, h.y, h.w, h.h));
  log('---API---');
  api.filter(a => a.dir === 'RES' && a.st === 200).forEach(a => log('  ', a.m, a.u.replace('https://idreamsky.feishu.cn', '')));
  fs.writeFileSync(path.join(OUT, '00-api.json'), JSON.stringify(api, null, 1), 'utf8');
  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
