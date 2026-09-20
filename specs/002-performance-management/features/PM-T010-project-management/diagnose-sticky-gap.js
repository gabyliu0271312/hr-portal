// PM-T010 白缝定位脚本：在本地项目管理页（周期概览）Console 运行
// 用法：先向下滚动一段（页签条已吸顶），再粘贴本脚本回车。纯只读。
(() => {
  const pick = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      selector: el.className && el.className.toString ? el.className.toString().slice(0, 60) : el.tagName,
      top: Math.round(r.top), height: Math.round(r.height), bottom: Math.round(r.bottom),
      bg: cs.backgroundColor, z: cs.zIndex, position: cs.position,
    }
  }
  const content = document.querySelector('.management-content')
  const holder = document.querySelector('.line-tabs-holder')
  const tabs = document.querySelector('.line-tabs')
  const card = document.querySelector('.surface-card')
  const title = document.querySelector('.page-title-text')

  // 滚动容器视口顶 = content.getBoundingClientRect().top
  const viewportTop = content ? Math.round(content.getBoundingClientRect().top) : null
  // 逐像素检查 viewportTop 到 holder.top 之间每个元素的命中与颜色
  const probe = []
  if (content && holder) {
    const holderTop = Math.round(holder.getBoundingClientRect().top)
    const from = Math.max(viewportTop, holderTop - 40)
    for (let y = from; y <= holderTop; y += 2) {
      const stack = document.elementsFromPoint(Math.round(content.getBoundingClientRect().left + content.clientWidth / 2), y)
      probe.push({
        y,
        rel: y - viewportTop,
        top3: stack.slice(0, 3).map((el) => `${(el.className && el.className.toString ? el.className.toString() : el.tagName).slice(0, 40) || el.tagName}(${getComputedStyle(el).backgroundColor.slice(0, 20)})`),
      })
    }
  }

  const result = {
    meta: { url: location.href, note: 'PM-T010 白缝定位：只读 elementsFromPoint 采样' },
    scroll: content ? { scrollTop: Math.round(content.scrollTop) } : null,
    viewportTop,
    elements: { content: pick(content), holder: pick(holder), tabs: pick(tabs), card: pick(card), title: pick(title) },
    probe,
  }
  const json = JSON.stringify(result, null, 1)
  console.log(json)
  navigator.clipboard?.writeText(json).then(() => console.log('✅ 已复制')).catch(() => {})
  return result
})()
