// PM-T003「权限范围」选中态专项采集
// 使用前：在目标添加 HRBP 弹窗中选择 1～2 个部门，然后关闭部门树，保留选择结果。
// 执行后：脚本采集选择框已选展示，自动重新打开并采集树内选中节点，随后下载 JSON。
// 请同时提供：① 选择框关闭态截图；② 重新打开后的部门树截图；③ 下载的 JSON。

(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
  const visible = (el) => {
    if (!(el instanceof Element)) return false
    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
  }
  const rect = (el) => {
    const value = el.getBoundingClientRect()
    return Object.fromEntries(['x', 'y', 'width', 'height', 'top', 'right', 'bottom', 'left'].map((key) => [key, Number(value[key].toFixed(2))]))
  }
  const PROPS = [
    'display', 'position', 'z-index', 'overflow', 'overflow-x', 'overflow-y',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'box-sizing', 'align-items', 'justify-content', 'gap',
    'color', 'background-color', 'opacity',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-top-style', 'border-radius', 'box-shadow',
    'font-family', 'font-size', 'font-weight', 'line-height', 'text-align', 'white-space',
    'cursor', 'transform', 'transition',
  ]
  const style = (el, pseudo = null) => {
    const computed = getComputedStyle(el, pseudo)
    return Object.fromEntries(PROPS.map((name) => [name, computed.getPropertyValue(name)]))
  }
  const selector = (el) => {
    if (!(el instanceof Element)) return null
    if (el.id) return `#${CSS.escape(el.id)}`
    const parts = []
    let node = el
    for (let index = 0; node && index < 5; index += 1) {
      let part = node.tagName.toLowerCase()
      const classes = [...node.classList].filter((name) => !/^u[a-z0-9]{5,}$/i.test(name)).slice(0, 5)
      if (classes.length) part += classes.map((name) => `.${CSS.escape(name)}`).join('')
      parts.unshift(part)
      node = node.parentElement
    }
    return parts.join(' > ')
  }
  const svg = (el) => [...el.querySelectorAll('svg')].map((icon) => ({
    dataIcon: icon.getAttribute('data-icon'),
    viewBox: icon.getAttribute('viewBox'),
    bbox: rect(icon),
    color: getComputedStyle(icon).color,
    paths: [...icon.querySelectorAll('path')].map((path) => ({
      d: path.getAttribute('d'),
      fill: path.getAttribute('fill'),
      stroke: path.getAttribute('stroke'),
      strokeWidth: path.getAttribute('stroke-width'),
    })),
  }))
  const snapshot = (el, includeHtml = false) => {
    if (!(el instanceof Element)) return null
    const result = {
      tag: el.tagName.toLowerCase(),
      selector: selector(el),
      classes: [...el.classList],
      role: el.getAttribute('role'),
      ariaSelected: el.getAttribute('aria-selected'),
      ariaChecked: el.getAttribute('aria-checked'),
      ariaExpanded: el.getAttribute('aria-expanded'),
      text: normalize(el.innerText || el.textContent).slice(0, 500),
      bbox: rect(el),
      styles: style(el),
      before: getComputedStyle(el, '::before').content,
      after: getComputedStyle(el, '::after').content,
      svg: svg(el),
    }
    if (includeHtml) result.html = el.outerHTML.slice(0, 20000)
    return result
  }

  const findSelector = () => {
    const placeholder = [...document.querySelectorAll('input[placeholder],div,span')]
      .find((el) => visible(el) && (
        normalize(el.getAttribute?.('placeholder')) === '输入关键词选择部门'
        || normalize(el.innerText || el.textContent) === '输入关键词选择部门'
      ))
    if (placeholder) {
      const found = placeholder.closest('.ud__select__selector, [class*="select__selector"], [role="combobox"]')
      if (found) return found
    }
    return [...document.querySelectorAll('.ud__select__selector, [class*="select__selector"]')]
      .filter(visible)
      .find((el) => {
        const field = el.closest('.ud__form__item, [data-index]')
        return normalize(field?.innerText || field?.textContent).includes('权限范围')
      }) || null
  }

  const findPopup = () => [...document.querySelectorAll(
    '.ud__select__dropdown.department-tree-select-dropdown, .department-tree-select-dropdown, [class*="department-tree-select-dropdown"]'
  )].find(visible) || null

  const isBlue = (value) => [
    'rgb(51, 109, 244)', 'rgb(51, 112, 255)', 'rgb(20, 86, 240)',
  ].includes(value)

  const selectedDescendants = (root) => [...root.querySelectorAll('*')]
    .filter(visible)
    .filter((el) => {
      const className = String(el.className || '')
      const computed = getComputedStyle(el)
      return /selected|checked|active|tag|token|choice/i.test(className)
        || el.getAttribute('aria-selected') === 'true'
        || el.getAttribute('aria-checked') === 'true'
        || isBlue(computed.color)
        || isBlue(computed.backgroundColor)
        || isBlue(computed.borderTopColor)
    })
    .slice(0, 120)

  const selectorRoot = findSelector()
  if (!selectorRoot) {
    console.error('未找到权限范围选择框，请确认已经选择部门并关闭部门树。')
    return
  }

  const closed = {
    selector: snapshot(selectorRoot, true),
    selectedElements: selectedDescendants(selectorRoot).map((el) => snapshot(el)),
    directChildren: [...selectorRoot.children].filter(visible).map((el) => snapshot(el, true)),
  }

  const trigger = selectorRoot.closest('[role="combobox"], button') || selectorRoot
  trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
  trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }))
  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  await sleep(700)

  const popup = findPopup()
  if (!popup) {
    console.error('选择框已定位，但重新打开后未找到部门树弹层。')
    return
  }

  const rows = [...popup.querySelectorAll('.ud__tree__node, [class*="tree__node"], [role="treeitem"]')]
    .filter(visible)
  const selectedRows = rows.filter((row) => {
    const className = String(row.className || '')
    const descendants = [...row.querySelectorAll('*')]
    return /selected|checked|active/i.test(className)
      || row.getAttribute('aria-selected') === 'true'
      || row.getAttribute('aria-checked') === 'true'
      || descendants.some((el) => {
        const computed = getComputedStyle(el)
        return /selected|checked|active/i.test(String(el.className || ''))
          || el.getAttribute('aria-selected') === 'true'
          || el.getAttribute('aria-checked') === 'true'
          || isBlue(computed.color)
          || isBlue(computed.backgroundColor)
      })
  })

  const opened = {
    popup: snapshot(popup, true),
    selectedRows: selectedRows.map((row) => ({
      row: snapshot(row, true),
      markedDescendants: selectedDescendants(row).map((el) => snapshot(el)),
    })),
    visibleRows: rows.slice(0, 40).map((row) => ({
      text: normalize(row.innerText || row.textContent),
      classes: [...row.classList],
      bbox: rect(row),
      color: getComputedStyle(row).color,
      backgroundColor: getComputedStyle(row).backgroundColor,
      childSummary: [...row.children].map((child) => ({
        tag: child.tagName.toLowerCase(),
        classes: [...child.classList],
        text: normalize(child.innerText || child.textContent),
        bbox: rect(child),
        color: getComputedStyle(child).color,
        backgroundColor: getComputedStyle(child).backgroundColor,
      })),
    })),
  }

  const result = {
    meta: {
      url: location.href,
      capturedAt: new Date().toISOString(),
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      note: '权限范围已选展示与重新打开后的选中节点专项采集；无保存、提交或认证信息读取。',
    },
    closed,
    opened,
  }

  const json = JSON.stringify(result, null, 2)
  console.log(result)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'pm-t003-hrbp-department-tree-selected.json'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  console.log('%c✅ 已下载选中态 JSON，请连同关闭态和重新打开态截图返回给 Claude', 'color:#16803c;font-weight:bold')
})()
