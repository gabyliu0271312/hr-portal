/* REA 抓取 12：项目设置「复制」弹窗 + 「删除」确认弹窗
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
      const d = [...document.querySelectorAll('div.sc-EhVdV')].find(el => { const r = el.getBoundingClientRect(); return r.width === 24 && r.y >= 490 && r.y <= 530 && getComputedStyle(el).cursor === 'pointer'; });
      if (!d) return null;
      const r = d.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!loc) throw new Error('no more btn');
    await page.mouse.move(loc.x, loc.y);
    await page.waitForTimeout(1600);
  };
  const capBox = async () => page.evaluate(() => {
    const wrap = [...document.querySelectorAll('.perf-web__ud__dialog__wrap')].find(el => el.getBoundingClientRect().width > 0 && (el.textContent || '').trim().length > 3);
    if (!wrap) return { found: false };
    const content = [...wrap.querySelectorAll('.perf-web__ud__dialog__content')][0] || wrap;
    const lines = [];
    const walk = (el, depth) => {
      if (depth > 4) return;
      const rr = el.getBoundingClientRect();
      if (rr.width <= 0 && rr.height <= 0 && depth > 0) return;
      lines.push({ d: depth, tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 80), t: (el.textContent || '').trim().slice(0, 30), x: +rr.x.toFixed(0), y: +rr.y.toFixed(0), w: +rr.width.toFixed(0), h: +rr.height.toFixed(0) });
      [...el.children].slice(0, 14).forEach(k => walk(k, depth + 1));
    };
    walk(content, 0);
    const inputs = [...content.querySelectorAll('input,textarea')].filter(el => { const rr = el.getBoundingClientRect(); return rr.width > 0 && rr.height > 0; }).map(el => ({ tag: el.tagName, ph: (el.placeholder || '').slice(0, 24), val: (el.value || '').slice(0, 40) }));
    const btns = [...content.querySelectorAll('button')].filter(el => (el.textContent || '').trim() && el.getBoundingClientRect().width > 0).map(el => ({ t: (el.textContent || '').trim().slice(0, 12), cls: (el.className || '').toString().slice(0, 50), disabled: el.disabled }));
    return { found: true, text: (wrap.textContent || '').trim().slice(0, 100), lines, inputs, btns };
  });
  const cancelBox = async () => {
    await page.evaluate(() => {
      const wrap = [...document.querySelectorAll('.perf-web__ud__dialog__wrap')].find(el => el.getBoundingClientRect().width > 0);
      const btn = wrap && [...wrap.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '取消');
      if (btn) btn.click();
    });
    await page.waitForTimeout(700);
  };

  // 复制弹窗
  await openMore();
  try { await page.locator('.perf-web__ud__menu-normal-item').filter({ hasText: '复制' }).first().click({ timeout: 5000 }); log('COPY ok'); } catch (e) { log('COPY fail', e.message.slice(0, 60)); }
  await page.waitForTimeout(1500);
  const copyDlg = await capBox();
  fs.writeFileSync(path.join(OUT, '36-proj-copy-dialog.json'), JSON.stringify(copyDlg, null, 2), 'utf8');
  try { await page.screenshot({ path: path.join(OUT, '37-proj-copy-dialog.png'), timeout: 10000 }); log('SHOT1 ok'); } catch (e) { log('SHOT1 fail', e.message.slice(0, 50)); }
  log('PROJ_COPY', copyDlg.found, 'text', copyDlg.text, 'inputs', JSON.stringify(copyDlg.inputs), 'btns', JSON.stringify(copyDlg.btns));
  log('PROJ_COPY_LINES', JSON.stringify((copyDlg.lines || []).filter(l => l.t).slice(0, 12)));
  await cancelBox();

  // 删除确认弹窗
  await openMore();
  try { await page.locator('.perf-web__ud__menu-normal-item').filter({ hasText: '删除' }).first().click({ timeout: 5000 }); log('DEL ok'); } catch (e) { log('DEL fail', e.message.slice(0, 60)); }
  await page.waitForTimeout(1500);
  const delDlg = await capBox();
  fs.writeFileSync(path.join(OUT, '38-proj-delete-dialog.json'), JSON.stringify(delDlg, null, 2), 'utf8');
  try { await page.screenshot({ path: path.join(OUT, '39-proj-delete-dialog.png'), timeout: 10000 }); log('SHOT2 ok'); } catch (e) { log('SHOT2 fail', e.message.slice(0, 50)); }
  log('PROJ_DELETE', delDlg.found, 'text', delDlg.text, 'btns', JSON.stringify(delDlg.btns));
  log('PROJ_DELETE_LINES', JSON.stringify((delDlg.lines || []).filter(l => l.t).slice(0, 10)));
  await cancelBox();

  await browser.close().catch(() => {});
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
