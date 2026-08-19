(() => {
  const round = (value) => Number(value.toFixed(4))
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 20 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'
  }
  const style = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return {
      tag: el.tagName.toLowerCase(),
      className: typeof el.className === 'string' ? el.className : '',
      dataUiFlowId: el.getAttribute('data-ui-flow-id'),
      text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 100),
      rect: { x: round(r.x), y: round(r.y), width: round(r.width), height: round(r.height), top: round(r.top), right: round(r.right), bottom: round(r.bottom) },
      backgroundColor: s.backgroundColor,
      borderTop: s.borderTop,
      borderRight: s.borderRight,
      borderBottom: s.borderBottom,
      borderLeft: s.borderLeft,
      boxShadow: s.boxShadow,
      opacity: s.opacity,
      parent: el.parentElement ? { tag: el.parentElement.tagName.toLowerCase(), className: typeof el.parentElement.className === 'string' ? el.parentElement.className : '', text: (el.parentElement.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80) } : null,
    }
  }
  const all = [...document.querySelectorAll('body *')].filter(visible)
  const lines = all.filter((el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    const horizontalBorder = [s.borderTopColor, s.borderBottomColor].some((color) => color !== 'rgba(0, 0, 0, 0)')
    const horizontalBg = r.height <= 2.5 && s.backgroundColor !== 'rgba(0, 0, 0, 0)'
    return r.width >= 100 && (horizontalBorder || horizontalBg) && r.height <= 3
  }).map(style)
  const text = (value) => [...document.querySelectorAll('body *')].find((el) => el.children.length === 0 && el.textContent?.trim() === value) || null
  const title = (value) => { const el = text(value); return el ? style(el) : null }
  const result = {
    capturedAt: new Date().toISOString(),
    url: location.href,
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    targetTitles: {
      left: title('按评估流程配置'),
      middle: title('配置填写内容') || title('配置查看内容'),
      right: title('内容设置'),
    },
    knownContainers: {
      stagePanel: document.querySelector('[data-ui-flow-id="StagesPanelContent"]') ? style(document.querySelector('[data-ui-flow-id="StagesPanelContent"]')) : null,
      middleByText: (() => { const el = text('配置填写内容') || text('配置查看内容'); return el?.parentElement?.parentElement ? style(el.parentElement.parentElement) : null })(),
      rightPanel: document.querySelector('.text-normal') ? style(document.querySelector('.text-normal')) : null,
    },
    horizontalLineCandidates: lines,
    lineCount: lines.length,
  }
  console.log('PM-T004-T05 precise line measurements', result)
  console.table(lines.map((line, index) => ({ index, x: line.rect.x, y: line.rect.y, width: line.rect.width, height: line.rect.height, background: line.backgroundColor, borderTop: line.borderTop, borderBottom: line.borderBottom, className: line.className })))
  const payload = JSON.stringify(result, null, 2)
  if (typeof copy === 'function') copy(payload)
  else navigator.clipboard?.writeText(payload)
  console.info('完整 JSON 已复制。请直接粘贴到对话中，不要只粘贴折叠对象摘要。')
  return result
})()
