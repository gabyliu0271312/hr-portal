/* REA 抓取 3：弹窗内部 head/body/footer 树 + 保存接口（填表→确定→抓请求）
 * 用法: node capture-role-add-dialog3.js
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

  // 确保弹窗打开
  const hasDialog = await page.evaluate(() => [...document.querySelectorAll('*')].some(el => (el.textContent || '').trim() === '名称' && el.getBoundingClientRect().width > 0));
  if (!hasDialog) {
    log('REOPEN');
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(el => (el.textContent || '').trim() === '添加评估角色'); b && b.click(); });
    await page.waitForTimeout(1500);
  }

  // A) 弹窗 box 内部树（4 层）
  const tree = await page.evaluate(() => {
    const box = [...document.querySelectorAll('.perf-web__ud__modal__content')].find(el => (el.textContent || '').includes('添加评估角色') && el.getBoundingClientRect().width > 0);
    if (!box) return { found: false };
    const lines = [];
    const walk = (el, depth) => {
      if (depth > 4) return;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 && r.height <= 0 && depth > 0) return;
      const cs = getComputedStyle(el);
      const kids = [...el.children].filter(k => k.tagName !== 'SCRIPT' && k.tagName !== 'STYLE');
      lines.push({
        d: depth,
        tag: el.tagName.toLowerCase(),
        cls: (el.className && el.className.toString ? el.className.toString().slice(0, 100) : ''),
        rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
        t: (el.textContent || '').trim().slice(0, 20),
        kids: kids.length,
        st: {
          bg: cs.backgroundColor, color: cs.color, radius: cs.borderRadius, pad: cs.padding,
          fs: cs.fontSize, fw: cs.fontWeight, lh: cs.lineHeight, border: cs.borderColor,
          justify: cs.justifyContent, align: cs.alignItems, display: cs.display, position: cs.position,
        },
      });
      kids.slice(0, 20).forEach(k => walk(k, depth + 1));
    };
    walk(box, 0);
    return { found: true, boxCls: (box.className || '').toString(), lines };
  });
  fs.writeFileSync(path.join(OUT, '08-dialog-tree.json'), JSON.stringify(tree, null, 2), 'utf8');
  log('TREE_LINES', tree.found ? tree.lines.length : 0);

  // B) 填表并保存，抓网络
  const net = [];
  const onReq = (req) => {
    if (!/role|permission/i.test(req.url())) return;
    const rec = { url: req.url(), method: req.method(), type: req.resourceType(), body: null, headers: {} };
    try { rec.body = req.postData(); } catch (e) {}
    rec.headers = { ct: req.headers()['content-type'] || '' };
    net.push({ kind: 'req', ...rec });
  };
  const onRes = async (res) => {
    if (!/role|permission/i.test(res.url())) return;
    let body = null;
    try { const b = await res.body(); body = b ? b.toString('utf8').slice(0, 2000) : null; } catch (e) {}
    net.push({ kind: 'res', url: res.url(), status: res.status(), body });
  };
  page.on('request', onReq);
  page.on('response', onRes);

  // 定位弹窗内 input/textarea（排除搜索框与分页）
  const filled = await page.evaluate(() => {
    const box = [...document.querySelectorAll('.perf-web__ud__modal__content')].find(el => (el.textContent || '').includes('添加评估角色') && el.getBoundingClientRect().width > 0);
    if (!box) return { ok: false };
    const inputs = [...box.querySelectorAll('input')];
    const textareas = [...box.querySelectorAll('textarea')];
    // 第一个可编辑 input = 中文名称；若存在第二个 = 英文名称
    return { inputCount: inputs.length, textareaCount: textareas.length, inputPlaceholders: inputs.map(i => i.placeholder) };
  });
  log('FORM_COUNT', JSON.stringify(filled));

  const saved = await page.evaluate(() => {
    const box = [...document.querySelectorAll('.perf-web__ud__modal__content')].find(el => (el.textContent || '').includes('添加评估角色') && el.getBoundingClientRect().width > 0);
    if (!box) return { ok: false };
    const inputs = [...box.querySelectorAll('input')];
    const textareas = [...box.querySelectorAll('textarea')];
    const setNative = (el, val) => {
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      desc.set.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    if (inputs.length) setNative(inputs[0], 'REA采集测试评估角色');
    if (inputs.length > 1) setNative(inputs[1], 'REA test review role');
    if (textareas.length) setNative(textareas[0], 'REA采集用的临时测试评估角色，仅用于抓取保存接口');
    // 点确定
    const ok = [...box.querySelectorAll('button')].find(el => (el.textContent || '').trim() === '确定');
    if (!ok) return { ok: false, reason: 'no-ok-btn' };
    ok.click();
    return { ok: true };
  });
  log('SAVED_CLICK', JSON.stringify(saved));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, '09-after-save.png') });

  // C) 保存后列表重新加载，抓 roles 接口
  const afterRoles = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.perf-web__ud__table__row, [class*=table-row], tr')].map(el => (el.textContent || '').trim().slice(0, 80)).filter(Boolean).slice(0, 20);
    return rows;
  });
  fs.writeFileSync(path.join(OUT, '10-net.json'), JSON.stringify(net, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT, '11-after-rows.json'), JSON.stringify(afterRoles, null, 2), 'utf8');
  log('NET', net.length);
  net.filter(n => n.kind === 'req').forEach(n => log('REQ', n.method, n.url.slice(-90), n.body ? n.body.slice(0, 300) : ''));
  net.filter(n => n.kind === 'res').forEach(n => log('RES', n.status, n.url.slice(-90), n.body ? n.body.slice(0, 200) : ''));
  log('AFTER_ROWS', JSON.stringify(afterRoles));

  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
