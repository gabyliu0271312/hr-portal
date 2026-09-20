// PM-T003 项目设置表格横向滚动条审计脚本
// 用法：打开周期与项目页（或飞书克隆页），选中一个有项目的周期，
// 把本文件内容整体粘贴到 DevTools Console 回车运行，把输出的 JSON 发回。
// 建议视口 1920x1080（与契约 clone:base 一致）；若你在其他尺寸看到双滚动条，也在该尺寸再跑一次。
(() => {
  const isVisible = (el) => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };

  const pathOf = (el, depth = 6) => {
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && parts.length < depth) {
      const cls = (typeof cur.className === 'string' ? cur.className : '').trim();
      const short = cls ? cls.split(/\s+/).slice(0, 2).join('.') : '';
      parts.unshift(cur.tagName.toLowerCase() + (short ? '.' + short : ''));
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  };

  const metrics = (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      selector: pathOf(el),
      bbox: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) },
      overflow_x: cs.overflowX,
      overflow_y: cs.overflowY,
      scroll_width: el.scrollWidth,
      client_width: el.clientWidth,
      h_overflow_px: el.scrollWidth - el.clientWidth,
      h_scrollbar_layout_space:
        el.offsetHeight - el.clientHeight -
        parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth) > 0,
    };
  };

  const region =
    document.querySelector('.project-settings') ||
    document.querySelector('.ud__table-content')?.closest('.ud__card') ||
    document.body;

  const active = [];
  const dormant = [];
  document.querySelectorAll('*').forEach((el) => {
    if (!isVisible(el)) return;
    const cs = getComputedStyle(el);
    if (cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') return;
    const overflowing = el.scrollWidth > el.clientWidth + 1;
    const inRegion = region.contains(el);
    if (overflowing) active.push({ ...metrics(el), in_table_region: inRegion });
    else if (inRegion) dormant.push(metrics(el));
  });

  const tableRoot =
    document.querySelector('.project-table-wrap') ||
    document.querySelector('.ud__table-content');
  const chain = [];
  let columns = [];
  if (tableRoot) {
    const target = tableRoot.querySelector('table');
    let cur = target;
    while (cur && cur !== tableRoot.parentElement) {
      chain.unshift(metrics(cur));
      cur = cur.parentElement;
    }
    if (target) {
      const colWidths = [...target.querySelectorAll('colgroup col')].map(
        (c) => c.style.width || c.getAttribute('width') || ''
      );
      columns = [...target.querySelectorAll('thead th')].map((th, i) => {
        const r = th.getBoundingClientRect();
        return {
          index: i,
          text: th.innerText.trim().replace(/\s+/g, ' '),
          col_attr: colWidths[i] ?? '',
          bbox: { x: +r.x.toFixed(1), width: +r.width.toFixed(1) },
        };
      });
      columns.push({ index: 'sum', text: '', col_attr: '', bbox: { x: '', width: columns.reduce((s, c) => s + c.bbox.width, 0) } });
    }
  }

  const report = {
    audit: 'pm-t003-h-scrollbar',
    url: location.href,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    timestamp: new Date().toISOString(),
    active_h_scroll: active,
    dormant_scroll_owners_in_table_region: dormant,
    table_dom_chain: chain,
    table_columns: columns,
  };

  console.table(active);
  if (columns.length) console.table(columns.map((c) => ({ i: c.index, text: c.text, col: c.col_attr, x: c.bbox.x, w: c.bbox.width })));
  console.log(JSON.stringify(report, null, 2));
  try {
    copy(JSON.stringify(report, null, 2));
    console.info('报告 JSON 已复制到剪贴板');
  } catch (e) {
    console.warn('自动复制失败，请手动复制上方 JSON');
  }
})();
