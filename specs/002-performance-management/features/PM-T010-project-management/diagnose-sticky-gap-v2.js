// PM-T010 v2 白缝定位：修复后复测。滚动一段后运行。纯只读。
(() => {
  const pick = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      selector: (el.className && el.className.toString ? el.className.toString() : el.tagName).slice(0, 50),
      top: Math.round(r.top), height: Math.round(r.height), bottom: Math.round(r.bottom),
      bg: cs.backgroundColor, z: cs.zIndex, position: cs.position,
      overflow: `${cs.overflowX}/${cs.overflowY}`, scrollTop: el.scrollTop ?? null,
    }
  }

  const holder = document.querySelector('.line-tabs-holder')
  const content = document.querySelector('.management-content')

  // holder 的完整祖先链：谁在滚、谁在裁剪
  const chain = []
  let node = holder
  while (node && node !== document.documentElement) {
    const cs = getComputedStyle(node)
    chain.push({
      selector: (node.className && node.className.toString ? node.className.toString() : node.tagName).slice(0, 50),
      overflow: `${cs.overflowX}/${cs.overflowY}`,
      scrollTop: node.scrollTop ?? 0, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight,
      canScroll: node.scrollHeight > node.clientHeight + 1,
      rect_top: Math.round(node.getBoundingClientRect().top),
    })
    node = node.parentElement
  }
  // window 自身
  const win = { scrollY: window.scrollY, docScrollable: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1 }

  // 白缝区域逐点采样：从 head 底(56) 到 holder.top，加 holder 自身顶部
  const probe = []
  if (content && holder) {
    const holderTop = Math.round(holder.getBoundingClientRect().top)
    const startY = Math.min(56, holderTop + 4)
    for (let y = startY; y <= holderTop + 4; y += 2) {
      const stack = document.elementsFromPoint(Math.round(content.getBoundingClientRect().left + content.clientWidth / 2), y)
      probe.push({
        y,
        top2: stack.slice(0, 2).map((el) => `${(el.className && el.className.toString ? el.className.toString() : el.tagName).slice(0, 36)}|${getComputedStyle(el).backgroundColor.slice(0, 22)}`),
      })
    }
  }

  const result = {
    meta: { url: location.href, viewport: `${innerWidth}x${innerHeight}`, note: 'v2 修复后复测' },
    window: win,
    elements: { content: pick(content), holder: pick(holder) },
    ancestorChain: chain,
    probe,
  }
  const json = JSON.stringify(result, null, 1)
  console.log(json)
  navigator.clipboard?.writeText(json).then(() => console.log('✅ 已复制')).catch(() => {})
  return result
})()
