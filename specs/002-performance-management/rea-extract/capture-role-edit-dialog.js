/* REA 抓取 5：自定义评估角色「编辑」弹窗 + 「停用」确认弹窗
 * 用法: node capture-role-edit-dialog.js
 * 产出: out/role-add-dialog/ 下
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

  const captureDialog = () => page.evaluate(() => {
    const box = [...document.querySelectorAll('.perf-web__ud__modal__content')].find(el => el.getBoundingClientRect().width > 0);
    if (!box) return { found: false };
    const r = box.getBoundingClientRect();
    const lines = [];
    const walk = (el, depth) => {
      if (depth > 3) return;
      const rr = el.getBoundingClientRect();
      if (rr.width <= 0 && rr.height <= 0 && depth > 0) return;
      lines.push({ d: depth, tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 90), t: (el.textContent || '').trim().slice(0, 22), x: +rr.x.toFixed(0), y: +rr.y.toFixed(0), w: +rr.width.toFixed(0), h: +rr.height.toFixed(0) });
      [...el.children].slice(0, 16).forEach(k => walk(k, depth + 1));
    };
    walk(box, 0);
    const inputs = [...box.querySelectorAll('input,textarea')].filter(el => { const rr = el.getBoundingClientRect(); return rr.width > 0 && rr.height > 0; }).map(el => ({ tag: el.tagName, ph: (el.placeholder || '').slice(0, 20), val: (el.value || '').slice(0, 30), x: +el.getBoundingClientRect().x.toFixed(0), y: +el.getBoundingClientRect().y.toFixed(0) }));
    const btns = [...box.querySelectorAll('button')].filter(el => (el.textContent || '').trim() && el.getBoundingClientRect().width > 0).map(el => ({ t: (el.textContent || '').trim().slice(0, 12), cls: (el.className || '').toString().slice(0, 60), disabled: el.disabled }));
    return { found: true, boxRect: { x: r.x, y: r.y, w: r.width, h: r.height }, lines, inputs, btns };
  });

  // 1) 点开「编辑」（第 1 行自定义角色）
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter(el => (el.textContent || '').trim() === '编辑' && !el.disabled && el.getBoundingClientRect().width > 0);
    if (btns[0]) btns[0].click();
  });
  await page.waitForTimeout(1400);
  const editDlg = await captureDialog();
  fs.writeFileSync(path.join(OUT, '20-edit-dialog.json'), JSON.stringify(editDlg, null, 2), 'utf8');
  await page.screenshot({ path: path.join(OUT, '21-edit-dialog.png') });
  log('EDIT_DLG', editDlg.found, JSON.stringify(editDlg.boxRect), 'inputs', JSON.stringify(editDlg.inputs), 'btns', JSON.stringify(editDlg.btns));

  // 2) 关闭编辑弹窗（点关闭 X）
  await page.evaluate(() => {
    const box = [...document.querySelectorAll('.perf-web__ud__modal__content')].find(el => el.getBoundingClientRect().width > 0);
    const x = box && box.querySelector('.perf-web__ud__button--icon');
    if (x) x.click();
  });
  await page.waitForTimeout(900);

  // 3) 点「停用」（第 1 行）→ 采集确认弹窗
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter(el => (el.textContent || '').trim() === '停用' && !el.disabled && el.getBoundingClientRect().width > 0);
    if (btns[0]) btns[0].click();
  });
  await page.waitForTimeout(1200);
  const deactivateDlg = await captureDialog();
  fs.writeFileSync(path.join(OUT, '22-deactivate-dialog.json'), JSON.stringify(deactivateDlg, null, 2), 'utf8');
  await page.screenshot({ path: path.join(OUT, '23-deactivate-dialog.png') });
  log('DEACTIVATE_DLG', deactivateDlg.found, JSON.stringify(deactivateDlg.boxRect), 'lines', JSON.stringify((deactivateDlg.lines || []).filter(l => l.t).slice(0, 12)), 'btns', JSON.stringify(deactivateDlg.btns));

  // 4) 取消（不真的停用）
  await page.evaluate(() => {
    const box = [...document.querySelectorAll('.perf-web__ud__modal__content')].find(el => el.getBoundingClientRect().width > 0);
    const cancel = box && [...box.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '取消');
    if (cancel) cancel.click();
  });
  await page.waitForTimeout(800);

  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
