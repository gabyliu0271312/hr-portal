(() => {
  const round = (value) => Number(value.toFixed(4))
  const rect = (value) => value ? Object.fromEntries(
    ['x', 'y', 'width', 'height', 'top', 'right', 'bottom', 'left'].map((key) => [key, round(value[key])]),
  ) : null
  const textRect = (element) => {
    const node = [...element.childNodes].find((child) => child.nodeType === Node.TEXT_NODE && child.nodeValue.trim())
    if (!node) return rect(element.getBoundingClientRect())
    const range = document.createRange()
    range.selectNodeContents(node)
    return rect(range.getBoundingClientRect())
  }
  const styleInfo = (element) => {
    const style = getComputedStyle(element)
    return {
      rect: rect(element.getBoundingClientRect()),
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      color: style.color,
      backgroundColor: style.backgroundColor,
      borderTop: style.borderTop,
      padding: style.padding,
      margin: style.margin,
    }
  }
  const required = (selector) => {
    const element = document.querySelector(selector)
    if (!element) throw new Error(`Missing local element: ${selector}`)
    return element
  }

  const page = required('.content-settings-page')
  const leftPanel = required('.stage-panel')
  const middlePanel = required('.content-canvas')
  const rightPanel = required('.text-normal')
  const leftTitle = required('.stage-panel__header strong')
  const middleTitle = required('.content-tab')
  const rightTitle = required('.text-normal__title')
  const leftLine = required('.stage-card')
  const middleLine = required('.content-tabs__divider')
  const rightLine = required('.text-normal__divider')

  const titleRects = {
    left: textRect(leftTitle),
    middle: textRect(middleTitle),
    right: textRect(rightTitle),
  }
  const lineRects = {
    left: rect(leftLine.getBoundingClientRect()),
    middle: rect(middleLine.getBoundingClientRect()),
    right: rect(rightLine.getBoundingClientRect()),
  }
  const delta = (left, right, key = 'top') => round(left[key] - right[key])
  const result = {
    capturedAt: new Date().toISOString(),
    url: location.href,
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    page: styleInfo(page),
    panels: { left: styleInfo(leftPanel), middle: styleInfo(middlePanel), right: styleInfo(rightPanel) },
    titles: {
      left: { element: styleInfo(leftTitle), textRect: titleRects.left },
      middle: { element: styleInfo(middleTitle), textRect: titleRects.middle },
      right: { element: styleInfo(rightTitle), textRect: titleRects.right },
    },
    lines: {
      leftCardTopBorder: { ...styleInfo(leftLine), y: lineRects.left.top },
      middleDivider: { ...styleInfo(middleLine), y: lineRects.middle.top },
      rightDivider: { ...styleInfo(rightLine), y: lineRects.right.top },
    },
    deltas: {
      titleTop: {
        leftMinusMiddle: delta(titleRects.left, titleRects.middle),
        leftMinusRight: delta(titleRects.left, titleRects.right),
        middleMinusRight: delta(titleRects.middle, titleRects.right),
      },
      titleBottom: {
        leftMinusMiddle: delta(titleRects.left, titleRects.middle, 'bottom'),
        leftMinusRight: delta(titleRects.left, titleRects.right, 'bottom'),
        middleMinusRight: delta(titleRects.middle, titleRects.right, 'bottom'),
      },
      lineTop: {
        leftMinusMiddle: delta(lineRects.left, lineRects.middle),
        leftMinusRight: delta(lineRects.left, lineRects.right),
        middleMinusRight: delta(lineRects.middle, lineRects.right),
      },
      lineHeight: {
        leftMinusMiddle: round(parseFloat(getComputedStyle(leftLine).borderTopWidth) - lineRects.middle.height),
        leftMinusRight: round(parseFloat(getComputedStyle(leftLine).borderTopWidth) - lineRects.right.height),
        middleMinusRight: delta(lineRects.middle, lineRects.right, 'height'),
      },
    },
  }
  const payload = JSON.stringify(result, null, 2)
  console.log('PM-T004-T05 local alignment', result)
  console.table([
    { item: 'left title', ...titleRects.left },
    { item: 'middle title', ...titleRects.middle },
    { item: 'right title', ...titleRects.right },
    { item: 'left card border', y: lineRects.left.top, height: getComputedStyle(leftLine).borderTopWidth },
    { item: 'middle divider', y: lineRects.middle.top, height: lineRects.middle.height },
    { item: 'right divider', y: lineRects.right.top, height: lineRects.right.height },
  ])
  if (typeof copy === 'function') copy(payload)
  else navigator.clipboard?.writeText(payload)
  console.info('完整 JSON 已复制到剪贴板。')
  return result
})()
