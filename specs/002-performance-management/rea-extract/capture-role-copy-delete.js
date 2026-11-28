/* REA 抓取 7：复制弹窗 + 删除确认弹窗
 */
process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'out', 'role-add-dialog');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('feishu.cn'));
  if (!page) throw new Error('no feishu page');

  const openMore = async () => {
    const loc = await page.evaluate(() => {
      const div = [...document.querySelectorAll('div')].find(el => {
        const r = el.getBoundingClientRect();
        return r.width === 24 && r.height === 24 && r.y >= 330 && r.y <= 380 && getComputedStyle(el).cursor === 'pointer';
      });
      if (!div) return null;
      const r = div.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!loc) throw new Error('no more btn');
    await page.mouse.move(loc.x, loc.y);
    await page.waitForTimeout(1100);
  };
  const clickMenuItem = async (label) => {
    const ok = await page.evaluate((lb) => {
      const items = [...document.querySelectorAll('.perf-web__ud__menu-normal-item')];
      const it = items.find(el => (el.textContent || '').trim() === lb);
      if (!it) return false;
      it.click();
      return true;
    }, label);
    return ok;
  };
  const captureBox = async () => page.evaluate(() => {
    const box = [...document.querySelectorAll('.perf-web__ud__modal__content')].find(el => el.getBoundingClientRect().width > 0);
    if (!box) return { found: false };
    const r = box.getBoundingClientRect();
    const lines = [];
    const walk = (el, depth) => {
      if (depth > 3) return;
      const rr = el.getBoundingClientRect();
      if (rr.width <= 0 && rr.height <= 0 && depth > 0) return;
      lines.push({ d: depth, tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 90), t: (el.textContent || '').trim().slice(0, 30), x: +rr.x.toFixed(0), y: +rr.y.toFixed(0), w: +rr.width.toFixed(0), h: +rr.height.toFixed(0) });
      [...el.children].slice(0, 16).forEach(k => walk(k, depth + 1));
    };
    walk(box, 0);
    const inputs = [...box.querySelectorAll('input,textarea')].filter(el => { const rr = el.getBoundingClientRect(); return rr.width > 0 && rr.height > 0; }).map(el => ({ tag: el.tagName, ph: (el.placeholder || '').slice(0, 20), val: (el.value || '').slice(0, 40), x: +el.getBoundingClientRect().x.toFixed(0), y: +el.getBoundingClientRect().y.toFixed(0) }));
    const btns = [...box.querySelectorAll('button')].filter(el => (el.textContent || '').trim() && el.getBoundingClientRect().width > 0).map(el => ({ t: (el.textContent || '').trim().slice(0, 12), cls: (el.className || '').toString().slice(0, 55), disabled: el.disabled }));
    return { found: true, boxRect: { x: r.x, y: r.y, w: r.width, h: r.height }, lines, inputs, btns };
  });
  const closeBox = async () => {
    await page.evaluate(() => {
      const box = [...document.querySelectorAll('.perf-web__ud__modal__content')].find(el => el.getBoundingClientRect().width > 0);
      const x = box && box.querySelector('.perf-web__ud__button--icon');
      if (x) x.click();
    });
    await page.waitForTimeout(700);
  };

  // 1) 复制弹窗
  await openMore();
  const c1 = await clickMenuItem('复制');
  log('CLICK_COPY', c1);
  await page.waitForTimeout(1400);
  const copyDlg = await captureBox();
  fs.writeFileSync(path.join(OUT, '27-copy-dialog.json'), JSON.stringify(copyDlg, null, 2), 'utf8');
  await page.screenshot({ path: path.join(OUT, '28-copy-dialog.png') });
  log('COPY_DLG', copyDlg.found, JSON.stringify(copyDlg.boxRect), 'inputs', JSON.stringify(copyDlg.inputs), 'btns', JSON.stringify(copyDlg.btns));
  log('COPY_LINES', JSON.stringify((copyDlg.lines || []).filter(l => l.t).slice(0, 14)));
  await closeBox();

  // 2) 删除确认弹窗
  await openMore();
  const c2 = await clickMenuItem('删除');
  log('CLICK_DELETE', c2);
  await page.waitForTimeout(1400);
  const delDlg = await captureBox();
  fs.writeFileSync(path.join(OUT, '29-delete-dialog.json'), JSON.stringify(delDlg, null, 2), 'utf8');
  await page.screenshot({ path: path.join(OUT, '30-delete-dialog.png') });
  log('DELETE_DLG', delDlg.found, JSON.stringify(delDlg.boxRect), 'btns', JSON.stringify(delDlg.btns));
  log('DELETE_LINES', JSON.stringify((delDlg.lines || []).filter(l => l.t).slice(0, 12)));
  // 取消（不真删）
  await page.evaluate(() => {
    const box = [...document.querySelectorAll('.perf-web__ud__modal__content')].find(el => el.getBoundingClientRect().width > 0);
    const cancel = box && [...box.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '取消');
    if (cancel) cancel.click();
  });
  await page.waitForTimeout(600);

  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
