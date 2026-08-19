(() => {
  const q = (selector, root = document) => root.querySelector(selector)
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)]
  const rect = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return {
      selector: el.dataset?.measureSelector || null,
      x: Number(r.x.toFixed(3)),
      y: Number(r.y.toFixed(3)),
      width: Number(r.width.toFixed(3)),
      height: Number(r.height.toFixed(3)),
      top: Number(r.top.toFixed(3)),
      right: Number(r.right.toFixed(3)),
      bottom: Number(r.bottom.toFixed(3)),
      display: s.display,
      boxSizing: s.boxSizing,
      padding: s.padding,
      margin: s.margin,
      borderTop: s.borderTop,
      borderBottom: s.borderBottom,
      font: `${s.fontWeight} ${s.fontSize}/${s.lineHeight} ${s.fontFamily}`,
      color: s.color,
    }
  }
  const mark = (el, name) => {
    if (el) el.dataset.measureSelector = name
    return el
  }
  const byText = (text) => qa('body *').find((el) => el.children.length === 0 && el.textContent?.trim() === text) || null
  const closestWithWidth = (el, minWidth = 100) => {
    let current = el
    while (current && current !== document.body) {
      const r = current.getBoundingClientRect()
      if (r.width >= minWidth && r.height >= 40) return current
      current = current.parentElement
    }
    return null
  }
  const sourceStagePanel = q('[data-ui-flow-id="StagesPanelContent"]')
  const sourceCards = qa('[data-ui-flow-id="StageContent"]')
  const sourceRight = q('.text-normal')
  const sourceLeftTitle = byText('按评估流程配置')
  const sourceMiddleTitle = byText('配置查看内容')
  const sourceRightTitle = byText('内容设置')
  const sourceResultCard = byText('绩效结果查看')
  const page = q('.content-settings-page') || closestWithWidth(sourceStagePanel, 300)
  const left = q('.stage-panel') || sourceStagePanel
  const middle = q('.content-canvas') || closestWithWidth(sourceResultCard, 500)
  const right = sourceRight
  const leftTitle = q('.stage-panel__header strong') || sourceLeftTitle
  const middleTitle = q('.content-tab') || sourceMiddleTitle
  const rightTitle = q('.text-normal__title') || sourceRightTitle
  const leftRule = q('.stage-list') || (sourceStagePanel && sourceStagePanel.firstElementChild)
  const middleRule = q('.content-tabs') || (sourceMiddleTitle && sourceMiddleTitle.parentElement)
  const rightRule = q('.text-normal__divider') || (sourceRightTitle && sourceRightTitle.parentElement?.nextElementSibling)
  const firstCard = q('.stage-card') || sourceCards[0]
  const firstIcon = q('.stage-card__icon svg, .stage-card__icon') || (sourceCards[0] && sourceCards[0].querySelector('svg'))
  const firstTitle = q('.stage-card__title') || (sourceCards[0] && byText('工作总结环节'))
  const firstExecutor = q('.stage-card__executor') || (sourceCards[0] && byText('执行人：被评估人'))
  const resultCard = q('.content-card--result') || closestWithWidth(sourceResultCard, 500)

  const result = {
    capturedAt: new Date().toISOString(),
    url: location.href,
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    selectorsFound: {
      page: !!page,
      left: !!left,
      middle: !!middle,
      right: !!right,
      leftTitle: !!leftTitle,
      middleTitle: !!middleTitle,
      rightTitle: !!rightTitle,
      leftRule: !!leftRule,
      middleRule: !!middleRule,
      rightRule: !!rightRule,
    },
    columns: { left: rect(left), middle: rect(middle), right: rect(right) },
    titles: { left: rect(leftTitle), middle: rect(middleTitle), right: rect(rightTitle) },
    topRules: { left: rect(leftRule), middle: rect(middleRule), right: rect(rightRule) },
    leftCard: { card: rect(firstCard), icon: rect(firstIcon), title: rect(firstTitle), executor: rect(firstExecutor) },
    middleCard: rect(resultCard),
    sourceMode: !!sourceStagePanel || sourceCards.length > 0,
    sourceStageCount: sourceCards.length,
    alignmentDeltas: {
      titleTop: { leftMinusMiddle: leftTitle && middleTitle ? Number((leftTitle.getBoundingClientRect().top - middleTitle.getBoundingClientRect().top).toFixed(3)) : null, leftMinusRight: leftTitle && rightTitle ? Number((leftTitle.getBoundingClientRect().top - rightTitle.getBoundingClientRect().top).toFixed(3)) : null },
      ruleTop: { leftMinusMiddle: leftRule && middleRule ? Number((leftRule.getBoundingClientRect().top - middleRule.getBoundingClientRect().top).toFixed(3)) : null, leftMinusRight: leftRule && rightRule ? Number((leftRule.getBoundingClientRect().top - rightRule.getBoundingClientRect().top).toFixed(3)) : null },
    },
  }
  console.log('PM-T004-T05 top alignment measurements', result)
  copy(JSON.stringify(result, null, 2)).then(() => console.info('Measurement JSON copied to clipboard.')).catch(() => {})
  return result
})()
