/* 精确测量: 关键元素 rect + computed style */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, 'profile'), {
    headless: false, viewport: { width: 1680, height: 950 }, deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto('https://idreamsky.feishu.cn/perf/admin/templates/7699791798989900738/4', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (document.body.innerText || '').includes('评估流程'), { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(6000);

  const data = await page.evaluate(() => {
    const gs = (el, props) => { const c = getComputedStyle(el); const o = {}; props.forEach(p => o[p] = c.getPropertyValue(p)); return o; };
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const byFlow = (id) => document.querySelector(`[data-ui-flow-id="${id}"]`);
    const out = { viewport: { w: innerWidth, h: innerHeight }, items: {} };

    // 顶栏与页头
    out.items.topbar = r(document.querySelector('.absolute.z-sticky'));
    out.items.pageHeader = r(document.querySelector('.page-header'));
    // 三栏
    const layout = byFlow('TemplatePreviewLayout');
    out.items.layout = layout ? r(layout) : null;
    const left = byFlow('StagesPanelContent');
    out.items.leftPanel = left ? r(left) : null;
    out.items.leftWrap = left ? r(left.parentElement) : null;
    out.items.container = byFlow('TemplatePreviewContainer') ? r(byFlow('TemplatePreviewContainer')) : null;
    // 环节卡
    const card = document.querySelector('.indexstyled__StageContent, [class*="StageContent"]') || left && left.querySelector('div[class*="Card"], div[class*="stage"]');
    // 用文本找第一张卡
    const firstStage = [...document.querySelectorAll('div')].find(d => d.innerText && d.innerText.trim().startsWith('填写工作总结') && d.innerText.includes('执行人') && d.getBoundingClientRect().height < 90 && d.getBoundingClientRect().width < 400);
    out.items.stageCard = firstStage ? r(firstStage) : null;
    if (firstStage) out.stageCardStyle = gs(firstStage, ['border-radius','border','background-color','padding','margin','box-shadow']);
    if (firstStage) { const nameEl = firstStage.querySelector('div'); out.stageCardFirstChild = r(firstStage.firstElementChild); }
    // 中右面板标签
    const tab = [...document.querySelectorAll('div')].find(d => d.innerText.trim() === '配置参考内容' && d.getBoundingClientRect().height < 60);
    if (tab) { out.items.panelTab = r(tab); out.panelTabStyle = gs(tab, ['background-color','font-size','color','padding','border-radius']); }
    // 被评估人卡
    const refCard = [...document.querySelectorAll('div')].filter(d => d.innerText.trim().startsWith('被评估人') && d.getBoundingClientRect().height < 120);
    if (refCard[0]) out.items.refCard = r(refCard[0]);
    // OKR O1 行
    const o1 = [...document.querySelectorAll('div')].filter(d => d.innerText.trim().startsWith('O1') && d.getBoundingClientRect().height < 80 && d.getBoundingClientRect().width > 300);
    if (o1[0]) { out.items.okrO1Row = r(o1[0]); out.okrO1Style = gs(o1[0], ['background-color','border-radius','font-size']); }
    // 右栏标题
    const rt = [...document.querySelectorAll('div,h1,h2,h3')].find(d => d.innerText.trim() === '填写工作总结' && d.getBoundingClientRect().height < 50 && d.children.length === 0);
    if (rt) out.rightTitleStyle = gs(rt, ['font-size','font-weight','color','line-height','margin']);
    // 左栏标题 评估流程
    const lt = [...document.querySelectorAll('div')].find(d => d.innerText.trim() === '评估流程' && d.children.length <= 2);
    if (lt) out.leftTitleStyle = gs(lt, ['font-size','font-weight','color']);
    // 面包屑容器
    const bc = [...document.querySelectorAll('div')].find(d => d.innerText.replace(/\n/g,'').includes('基本信息') && d.innerText.includes('模板预览') && d.getBoundingClientRect().height < 40 && d.getBoundingClientRect().width < 500);
    if (bc) { out.items.breadcrumb = r(bc); out.breadcrumbStyle = gs(bc, ['font-size','color']); }
    // 页头标题
    const title = [...document.querySelectorAll('div,span')].find(d => d.innerText && d.innerText.trim() === '编辑绩效模板' && d.children.length === 0);
    if (title) out.pageTitleStyle = gs(title, ['font-size','font-weight','color']);
    // 中栏 tab
    const mtabs = [...document.querySelectorAll('div')].filter(d => ['工作总结','自评','360°反馈','OKR','更多参考'].includes(d.innerText.trim()) && d.getBoundingClientRect().height < 40);
    if (mtabs[0]) out.midTabStyle = gs(mtabs[0], ['font-size','color','font-weight']);
    // 提交按钮
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '提交');
    if (btn) { out.items.submitBtn = r(btn); out.submitBtnStyle = gs(btn, ['background-color','color','font-size','border-radius','height','padding']); }
    const btn2 = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '取消');
    if (btn2) out.items.cancelBtn = r(btn2);
    const saveBtn = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '保存');
    if (saveBtn) { out.items.saveBtn = r(saveBtn); out.saveBtnStyle = gs(saveBtn, ['background-color','font-size','border-radius']); }
    const prevBtn = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '上一步');
    if (prevBtn) out.items.prevBtn = r(prevBtn);
    // 富文本框
    const ta = [...document.querySelectorAll('div[contenteditable],textarea')].filter(e => e.getBoundingClientRect().height > 30)[0];
    if (ta) { out.items.editor = r(ta); out.editorStyle = gs(ta, ['background-color','border','border-radius','font-size']); }
    // 执行人文字
    const exe = [...document.querySelectorAll('div,span')].find(d => d.innerText && d.innerText.trim().startsWith('执行人：') && d.children.length === 0);
    if (exe) out.executorStyle = gs(exe, ['font-size','color','line-height']);
    // 环节名文字
    if (firstStage) {
      const nm = [...firstStage.querySelectorAll('div,span')].find(d => d.innerText.trim() === '填写工作总结' && d.children.length === 0);
      if (nm) out.stageNameStyle = gs(nm, ['font-size','font-weight','color','line-height']);
      // 图标
      const ic = firstStage.querySelector('svg, img, i');
      if (ic) out.stageIcon = r(ic);
    }
    // 左栏背景/边框
    if (left) out.leftPanelStyle = gs(left, ['background-color','padding']);
    const mid = document.querySelector('.leftComp');
    if (mid) out.items.midPanel = r(mid);
    // 面板容器背景
    if (byFlow('TemplatePreviewContainer')) out.containerStyle = gs(byFlow('TemplatePreviewContainer'), ['background-color','gap']);
    return out;
  });

  fs.writeFileSync(path.join(__dirname, 'out', 'measure.json'), JSON.stringify(data, null, 2));
  console.log(JSON.stringify(data, null, 1).slice(0, 6000));
  await page.waitForTimeout(2000);
  await ctx.close();
})().catch(e => { console.error('[fatal]', e); process.exit(1); });
