(() => {
  const round = (n) => Number(n.toFixed(4))
  const rect = (r) => r ? { x: round(r.x), y: round(r.y), width: round(r.width), height: round(r.height), top: round(r.top), right: round(r.right), bottom: round(r.bottom), left: round(r.left) } : null
  const info = (el) => {
    if (!el) return null
    const s = getComputedStyle(el)
    return { rect: rect(el.getBoundingClientRect()), padding: s.padding, margin: s.margin, fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight, color: s.color, backgroundColor: s.backgroundColor, border: s.border, borderRadius: s.borderRadius, opacity: s.opacity }
  }
  const root = document.querySelector('[data-ui-flow-id="TemplateOperate"]')
  const buttons = root ? [...root.querySelectorAll('button')] : []
  const items = root ? [...root.querySelectorAll('[class*="StyledButton"], [class*="template-operate__item"]')] : []
  const result = { capturedAt: new Date().toISOString(), url: location.href, viewport: { width: innerWidth, height: innerHeight, devicePixelRatio }, found: { root: !!root, buttons: buttons.length, items: items.length }, root: info(root), buttons: buttons.map(info), items: items.map(info) }
  const payload = JSON.stringify(result, null, 2)
  console.log('PM-T004-T05 TemplateOperate parameters', result)
  console.table(buttons.map((button, index) => ({ index, ...info(button) })))
  if (typeof copy === 'function') copy(payload); else navigator.clipboard?.writeText(payload)
  console.info('完整 JSON 已复制到剪贴板。')
  return result
})()
