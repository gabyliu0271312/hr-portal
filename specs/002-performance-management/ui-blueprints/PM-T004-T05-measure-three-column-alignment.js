(() => {
  const round = (n) => Number(n.toFixed(4))
  const rect = (r) => r ? ({ x: round(r.x), y: round(r.y), width: round(r.width), height: round(r.height), top: round(r.top), right: round(r.right), bottom: round(r.bottom), left: round(r.left) }) : null
  const info = (el) => {
    if (!el) return null
    const s = getComputedStyle(el)
    return {
      tag: el.tagName.toLowerCase(),
      className: typeof el.className === 'string' ? el.className : '',
      text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 120),
      rect: rect(el.getBoundingClientRect()),
      padding: s.padding,
      margin: s.margin,
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      lineHeight: s.lineHeight,
      color: s.color,
      backgroundColor: s.backgroundColor,
      borderTop: s.borderTop,
      borderBottom: s.borderBottom,
      boxSizing: s.boxSizing,
    }
  }
  const exactText = (root, value) => [...root.querySelectorAll('*')].find((el) => el.children.length === 0 && el.textContent?.trim() === value) || null
  const textRect = (el, value) => {
    if (!el) return null
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node
    while ((node = walker.nextNode())) {
      const raw = node.nodeValue || ''
      const start = raw.indexOf(value)
      if (start >= 0) {
        const range = document.createRange()
        range.setStart(node, start)
        range.setEnd(node, start + value.length)
        return rect(range.getBoundingClientRect())
      }
    }
    return rect(el.getBoundingClientRect())
  }
  const climbToRect = (el, targetX, targetWidth) => {
    let current = el
    while (current && current !== document.body) {
      const r = current.getBoundingClientRect()
      if (Math.abs(r.x - targetX) < 1 && Math.abs(r.width - targetWidth) < 2) return current
      current = current.parentElement
    }
    return null
  }

  const leftPanel = document.querySelector('[data-ui-flow-id="StagesPanelContent"]')
  const firstCard = leftPanel?.querySelector('[data-ui-flow-id="StageContent"]') || document.querySelector('[data-ui-flow-id="StageContent"]')
  const leftTitle = leftPanel ? exactText(leftPanel, '按评估流程配置') : null

  const middleTitle = exactText(document, '配置填写内容') || exactText(document, '配置查看内容')
  const middlePanel = climbToRect(middleTitle, 320, 640)
  const middleLine = middlePanel?.querySelector('.ud__tabs__tab-bar-holder-divider') || document.querySelector('.ud__tabs__tab-bar-holder-divider')

  const emptyRightText = exactText(document, '暂未选择内容')
  const rightPanel = climbToRect(emptyRightText, 960, 320)
  const rightTitle = rightPanel ? exactText(rightPanel, '内容设置') : null
  const rightLine = rightPanel?.querySelector('.h-px, [class*="h-px"]') || null

  const leftTitleText = textRect(leftTitle, '按评估流程配置')
  const middleTitleValue = middleTitle?.textContent?.trim() || '配置填写内容'
  const middleTitleText = textRect(middleTitle, middleTitleValue)
  const rightTitleText = textRect(rightTitle, '内容设置')
  const leftLineRect = firstCard ? rect(firstCard.getBoundingClientRect()) : null
  const middleLineRect = middleLine ? rect(middleLine.getBoundingClientRect()) : null
  const rightLineRect = rightLine ? rect(rightLine.getBoundingClientRect()) : null

  const result = {
    capturedAt: new Date().toISOString(),
    url: location.href,
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    found: { leftPanel: !!leftPanel, middlePanel: !!middlePanel, rightPanel: !!rightPanel, leftTitle: !!leftTitle, middleTitle: !!middleTitle, rightTitle: !!rightTitle, leftLine: !!firstCard, middleLine: !!middleLine, rightLine: !!rightLine },
    panels: { left: info(leftPanel), middle: info(middlePanel), right: info(rightPanel) },
    titles: {
      left: { element: info(leftTitle), textRect: leftTitleText },
      middle: { element: info(middleTitle), textRect: middleTitleText },
      right: { element: info(rightTitle), textRect: rightTitleText },
    },
    lines: {
      leftCardTopBorder: { element: info(firstCard), y: leftLineRect?.top ?? null, thickness: firstCard ? getComputedStyle(firstCard).borderTopWidth : null },
      middleDivider: { element: info(middleLine), y: middleLineRect?.top ?? null, thickness: middleLineRect?.height ?? null },
      rightDivider: { element: info(rightLine), y: rightLineRect?.top ?? null, thickness: rightLineRect?.height ?? null },
    },
    deltas: {
      titleTop: {
        leftMinusMiddle: leftTitleText && middleTitleText ? round(leftTitleText.top - middleTitleText.top) : null,
        leftMinusRight: leftTitleText && rightTitleText ? round(leftTitleText.top - rightTitleText.top) : null,
        middleMinusRight: middleTitleText && rightTitleText ? round(middleTitleText.top - rightTitleText.top) : null,
      },
      titleBaselineApprox: {
        leftMinusMiddle: leftTitleText && middleTitleText ? round(leftTitleText.bottom - middleTitleText.bottom) : null,
        leftMinusRight: leftTitleText && rightTitleText ? round(leftTitleText.bottom - rightTitleText.bottom) : null,
        middleMinusRight: middleTitleText && rightTitleText ? round(middleTitleText.bottom - rightTitleText.bottom) : null,
      },
      lineTop: {
        leftMinusMiddle: leftLineRect && middleLineRect ? round(leftLineRect.top - middleLineRect.top) : null,
        leftMinusRight: leftLineRect && rightLineRect ? round(leftLineRect.top - rightLineRect.top) : null,
        middleMinusRight: middleLineRect && rightLineRect ? round(middleLineRect.top - rightLineRect.top) : null,
      },
    },
  }
  const payload = JSON.stringify(result, null, 2)
  console.log('PM-T004-T05 three-column alignment', result)
  console.table([
    { item: 'left title text', ...leftTitleText }, { item: 'middle title text', ...middleTitleText }, { item: 'right title text', ...rightTitleText },
    { item: 'left card top border', y: leftLineRect?.top, height: firstCard ? getComputedStyle(firstCard).borderTopWidth : null },
    { item: 'middle divider', y: middleLineRect?.top, height: middleLineRect?.height },
    { item: 'right divider', y: rightLineRect?.top, height: rightLineRect?.height },
  ])
  if (typeof copy === 'function') copy(payload)
  else navigator.clipboard?.writeText(payload)
  console.info('完整 JSON 已复制到剪贴板，请直接粘贴到对话中。')
  return result
})()
