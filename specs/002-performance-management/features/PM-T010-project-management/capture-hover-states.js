// PM-T010 完成率容器 hover 态补采脚本（v1，已被 capture-hover-rules.js 取代——合成事件无法激活 CSS :hover 伪类）
// 保留作记录；请改用 capture-hover-rules.js。

(() => {
  const DELAY = 400 // hover 稳定等待 ms
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  // ---- 定位目标 ----
  const findTargets = () => {
    // 分段组未选中段：radio-button 组里非 checked 的 wrapper（「按组织查看」段）
    const segments = [...document.querySelectorAll('.ud__radio-group-button .ud__radio-button__wrapper')]
    const uncheckedSegment = segments.find((el) => !el.className.includes('--checked'))
    // 已选中段（采集它的 hover 前基线）
    const checkedSegment = segments.find((el) => el.className.includes('--checked'))
    // 筛选按钮：含 FilterOutlined 图标的 outlined 按钮
    const filterBtn = [...document.querySelectorAll('button.ud__button--outlined')].find((el) => el.querySelector('[data-icon="FilterOutlined"]'))
    return { segments, uncheckedSegment, checkedSegment, filterBtn }
  }

  // ---- 采集一个元素的快照 ----
  const PROPS = [
    'color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-top-width', 'border-radius', 'box-shadow', 'opacity', 'cursor',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'font-size', 'font-weight', 'line-height',
  ]
  const snapshot = (el, state) => {
    if (!el) return null
    const cs = getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    const styles = {}
    for (const prop of PROPS) styles[prop] = cs.getPropertyValue(prop)
    // 元素内 icon 的颜色也要（hover 常变 icon 色）
    const icon = el.querySelector('svg')
    const iconStyle = icon ? { color: getComputedStyle(icon.closest('.universe-icon') || icon).color, width: getComputedStyle(icon).width, height: getComputedStyle(icon).height } : null
    return {
      state,
      selector_hint: `${el.tagName.toLowerCase()}${el.className.toString().split(/\s+/).slice(0, 4).map((c) => `.${c}`).join('')}`,
      bbox: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      styles,
      icon: iconStyle,
    }
  }

  const hover = (el) => {
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  }
  const unhover = (el) => {
    el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }))
    el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
  }

  const run = async () => {
    const { uncheckedSegment, checkedSegment, filterBtn } = findTargets()
    const missing = []
    if (!uncheckedSegment) missing.push('未选中分段按钮（ud__radio-group-button 内非 --checked wrapper）')
    if (!filterBtn) missing.push('筛选按钮（button.ud__button--outlined 含 FilterOutlined）')

    const result = {
      meta: {
        url: location.href,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        dpr: window.devicePixelRatio,
        captured_at: new Date().toISOString(),
        note: 'PM-T010 完成率容器 hover 态补采；纯 hover 派发，无点击无写操作',
      },
      targets_found: { unchecked_segment: !!uncheckedSegment, checked_segment: !!checkedSegment, filter_button: !!filterBtn },
      missing,
      data: {},
    }

    if (uncheckedSegment) {
      result.data.segment_unchecked_default = snapshot(uncheckedSegment, 'default')
      hover(uncheckedSegment); await sleep(DELAY)
      result.data.segment_unchecked_hover = snapshot(uncheckedSegment, 'hover')
      unhover(uncheckedSegment); await sleep(DELAY / 2)
      result.data.segment_unchecked_after = snapshot(uncheckedSegment, 'after-unhover')
    }
    if (checkedSegment) {
      result.data.segment_checked_default = snapshot(checkedSegment, 'default')
      hover(checkedSegment); await sleep(DELAY)
      result.data.segment_checked_hover = snapshot(checkedSegment, 'hover')
      unhover(checkedSegment); await sleep(DELAY / 2)
    }
    if (filterBtn) {
      result.data.filter_default = snapshot(filterBtn, 'default')
      hover(filterBtn); await sleep(DELAY)
      result.data.filter_hover = snapshot(filterBtn, 'hover')
      // 筛选按钮内部文字 span 的 hover 色也取一份
      const label = filterBtn.querySelector('span > span')
      if (label) result.data.filter_hover.label_color = getComputedStyle(label).color
      unhover(filterBtn); await sleep(DELAY / 2)
    }

    const json = JSON.stringify(result, null, 2)
    console.log(json)
    try {
      await navigator.clipboard.writeText(json)
      console.log('%c✅ 已复制到剪贴板，直接粘贴给 Claude 即可', 'color:#16803c;font-weight:bold')
    } catch {
      console.warn('剪贴板写入被拒，请手动复制上方 JSON')
    }
    return result
  }

  return run()
})()
