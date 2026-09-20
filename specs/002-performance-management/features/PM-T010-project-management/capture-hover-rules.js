// PM-T010 v2 hover 补采：扫描样式表中匹配目标的 :hover / :active 规则（CSSOM 只读）
// 用法：飞书绩效「周期概览」页 → DevTools Console → 粘贴回车。输出 JSON 并复制到剪贴板。
// 原理：合成事件无法激活 CSS :hover 伪类，因此改为直接读取样式表里作用于目标元素的真实 hover/active 规则。
// 纯只读：只读 document.styleSheets，不派发任何事件。

(() => {
  const targets = {
    unchecked_segment: [...document.querySelectorAll('.ud__radio-group-button .ud__radio-button__wrapper')].find((el) => !el.className.includes('--checked')) || null,
    checked_segment: [...document.querySelectorAll('.ud__radio-group-button .ud__radio-button__wrapper')].find((el) => el.className.includes('--checked')) || null,
    filter_button: [...document.querySelectorAll('button.ud__button--outlined')].find((el) => el.querySelector('[data-icon="FilterOutlined"]')) || null,
  }

  const result = {
    meta: {
      url: location.href,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      dpr: window.devicePixelRatio,
      captured_at: new Date().toISOString(),
      note: 'PM-T010 v2：CSSOM 扫描目标元素命中的 :hover/:active 规则；只读无事件派发',
    },
    targets_found: Object.fromEntries(Object.entries(targets).map(([k, v]) => [k, !!v])),
    rules: [],
  }

  const matchTargets = (baseSelector) => {
    const hit = []
    for (const [name, el] of Object.entries(targets)) {
      if (!el) continue
      try {
        if (el.matches(baseSelector) || document.querySelectorAll(`${baseSelector}`).includes?.(el)) {
          // matches 已足够；querySelectorAll 兜底复杂选择器
        }
        if (el.matches(baseSelector)) hit.push(name)
      } catch { /* 非法选择器跳过 */ }
    }
    return hit
  }

  const walk = (ruleList, depth = 0) => {
    if (depth > 12) return
    for (const rule of ruleList) {
      if (rule.cssRules && rule.selectorText === undefined) {
        walk(rule.cssRules, depth + 1) // CSSMediaRule / CSSSupportsRule 等分组规则
        continue
      }
      if (!rule.selectorText) continue
      const sel = rule.selectorText
      if (!sel.includes(':hover') && !sel.includes(':active')) continue
      const base = sel.replace(/:hover|:active/g, '')
      const hit = matchTargets(base)
      if (!hit.length) continue
      result.rules.push({
        selector: sel,
        matched_targets: hit,
        pseudo: sel.includes(':hover') && sel.includes(':active') ? 'both' : sel.includes(':hover') ? 'hover' : 'active',
        declarations: rule.style ? rule.style.cssText : '',
      })
    }
  }

  for (const sheet of document.styleSheets) {
    let rules
    try { rules = sheet.cssRules } catch { continue } // 跨域样式表跳过
    walk(rules)
  }

  const json = JSON.stringify(result, null, 2)
  console.log(json)
  navigator.clipboard?.writeText(json)
    .then(() => console.log('%c✅ 已复制到剪贴板，粘贴给 Claude 即可', 'color:#16803c;font-weight:bold'))
    .catch(() => console.warn('剪贴板被拒，请手动复制上方 JSON'))
  return result
})()
