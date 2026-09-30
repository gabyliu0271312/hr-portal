// PM-T003「添加 HRBP → 权限范围 → 部门树」参数采集脚本
// 使用方法：
// 1. 在目标飞书页面进入「HRBP 权限管理」，打开「添加 HRBP」弹窗，但不要打开「权限范围」。
// 2. 打开 DevTools Console，粘贴本脚本并回车；脚本会自动打开权限范围下拉并采集 default/open 状态。
// 3. 手工展开 2～3 层组织节点后执行：window.__pmT003HrbpTreeCapture.capture('expanded')
// 4. 如有搜索态，在搜索框输入关键词后执行：window.__pmT003HrbpTreeCapture.capture('searched')
// 5. 最后执行：window.__pmT003HrbpTreeCapture.stop()，JSON 会复制到剪贴板。
// 6. 将 JSON 和一张完整弹窗截图返回给 Claude。脚本不读取 Cookie/Token，不保存或提交表单。

(async () => {
  const KEY = '__pmT003HrbpTreeCapture'
  const previous = window[KEY]
  if (previous?.stop) await previous.stop({ copy: false, silent: true })

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
  const trim = (value, max = 12000) => {
    const text = String(value ?? '')
    return text.length > max ? `${text.slice(0, max)}…` : text
  }
  const visible = (el) => {
    if (!(el instanceof Element)) return false
    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
  }
  const bbox = (el) => {
    const rect = el.getBoundingClientRect()
    return {
      x: Number(rect.x.toFixed(2)),
      y: Number(rect.y.toFixed(2)),
      width: Number(rect.width.toFixed(2)),
      height: Number(rect.height.toFixed(2)),
      top: Number(rect.top.toFixed(2)),
      right: Number(rect.right.toFixed(2)),
      bottom: Number(rect.bottom.toFixed(2)),
      left: Number(rect.left.toFixed(2)),
    }
  }
  const STYLE_PROPS = [
    'display', 'position', 'z-index', 'overflow', 'overflow-x', 'overflow-y',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'box-sizing', 'align-items', 'justify-content', 'gap', 'row-gap', 'column-gap',
    'color', 'background-color', 'opacity',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-top-style', 'border-radius', 'box-shadow',
    'font-family', 'font-size', 'font-weight', 'line-height', 'text-align', 'white-space',
    'cursor', 'transform', 'transition',
  ]
  const styles = (el, pseudo = null) => {
    const computed = getComputedStyle(el, pseudo)
    return Object.fromEntries(STYLE_PROPS.map((prop) => [prop, computed.getPropertyValue(prop)]))
  }
  const selectorHint = (el) => {
    if (!(el instanceof Element)) return null
    if (el.id) return `#${CSS.escape(el.id)}`
    const parts = []
    let current = el
    for (let depth = 0; current && depth < 5; depth += 1) {
      let part = current.tagName.toLowerCase()
      const stableClasses = [...current.classList]
        .filter((name) => !/^u[a-z0-9]{5,}$/i.test(name))
        .slice(0, 4)
      if (stableClasses.length) part += stableClasses.map((name) => `.${CSS.escape(name)}`).join('')
      const parent = current.parentElement
      if (parent) {
        const sameTag = [...parent.children].filter((child) => child.tagName === current.tagName)
        if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`
      }
      parts.unshift(part)
      current = parent
    }
    return parts.join(' > ')
  }
  const pseudo = (el, name) => {
    const computed = getComputedStyle(el, name)
    const content = computed.content
    if (!content || content === 'none' || content === 'normal') return null
    return { name, content, styles: styles(el, name) }
  }
  const svg = (root) => [...root.querySelectorAll('svg')].map((el) => ({
    dataIcon: el.getAttribute('data-icon'),
    viewBox: el.getAttribute('viewBox'),
    bbox: bbox(el),
    styles: styles(el),
    paths: [...el.querySelectorAll('path')].map((path) => ({
      d: path.getAttribute('d'),
      fill: path.getAttribute('fill'),
      stroke: path.getAttribute('stroke'),
      strokeWidth: path.getAttribute('stroke-width'),
    })),
  }))
  const snapshot = (el) => {
    if (!(el instanceof Element)) return null
    return {
      tag: el.tagName.toLowerCase(),
      selector: selectorHint(el),
      classes: [...el.classList],
      role: el.getAttribute('role'),
      ariaExpanded: el.getAttribute('aria-expanded'),
      ariaSelected: el.getAttribute('aria-selected'),
      ariaChecked: el.getAttribute('aria-checked'),
      ariaLevel: el.getAttribute('aria-level'),
      text: trim(normalize(el.textContent), 1000),
      bbox: bbox(el),
      scroll: {
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
        scrollWidth: el.scrollWidth,
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
        scrollLeft: el.scrollLeft,
      },
      styles: styles(el),
      before: pseudo(el, '::before'),
      after: pseudo(el, '::after'),
      svg: svg(el),
    }
  }

  const findTextElement = (text) => {
    const candidates = [...document.querySelectorAll('label,div,span,p')]
      .filter((el) => visible(el) && normalize(el.innerText || el.textContent).includes(text))
      .sort((left, right) => {
        const leftText = normalize(left.innerText || left.textContent)
        const rightText = normalize(right.innerText || right.textContent)
        const leftExact = leftText === text ? 0 : 1
        const rightExact = rightText === text ? 0 : 1
        if (leftExact !== rightExact) return leftExact - rightExact
        const leftRect = left.getBoundingClientRect()
        const rightRect = right.getBoundingClientRect()
        return leftRect.width * leftRect.height - rightRect.width * rightRect.height
      })
    return candidates[0] || null
  }

  const findField = () => {
    const placeholderText = '输入关键词选择部门'
    const placeholder = [...document.querySelectorAll('input[placeholder],label,div,span,p')]
      .filter(visible)
      .find((el) => (
        normalize(el.getAttribute?.('placeholder')) === placeholderText
        || normalize(el.innerText || el.textContent) === placeholderText
      )) || null

    let selector = placeholder?.closest(
      '.ud__select__selector, [class*="select__selector"], [role="combobox"]',
    ) || null

    const labelCandidate = findTextElement('权限范围')
    let field = selector?.closest(
      '.ud__form__item, [class*="form__item"], [data-index]'
    ) || labelCandidate?.closest(
      '.ud__form__item, [class*="form__item"], [data-index]'
    ) || null

    if (!selector) {
      const candidates = [...document.querySelectorAll(
        '.ud__select__selector, [class*="select__selector"], [role="combobox"]'
      )].filter(visible)
      selector = candidates.find((candidate) => {
        const candidateField = candidate.closest('.ud__form__item, [class*="form__item"], [data-index]')
        const text = normalize(candidateField?.innerText || candidateField?.textContent)
        return text.includes('权限范围') || text.includes(placeholderText)
      }) || null
      field = field || selector?.closest('.ud__form__item, [class*="form__item"], [data-index]') || null
    }

    if (!field && labelCandidate) field = labelCandidate.parentElement
    const label = field
      ? [...field.querySelectorAll('label,div,span')]
        .filter(visible)
        .sort((left, right) => normalize(left.textContent).length - normalize(right.textContent).length)
        .find((el) => normalize(el.innerText || el.textContent).includes('权限范围')) || labelCandidate
      : labelCandidate

    return { label, field, selector, placeholder }
  }

  const findPopupRoots = () => {
    const selectors = [
      '[role="tree"]', '[role="listbox"]',
      '.ud__select__dropdown', '.ud__select__popup', '.ud__dropdown__overlay',
      '[class*="department-tree"]', '[class*="tree-select"]',
      '[class*="select-dropdown"]', '[class*="tree-dropdown"]',
    ]
    const candidates = [...new Set(selectors.flatMap((selector) => {
      try { return [...document.querySelectorAll(selector)] } catch { return [] }
    }))].filter(visible)
    return candidates.filter((el) => {
      const parentCandidate = candidates.find((parent) => parent !== el && parent.contains(el))
      return !parentCandidate
    })
  }

  const treeElements = (root) => {
    const selectors = [
      '[role="treeitem"]', '[role="option"]', '[role="checkbox"]',
      '.ud__tree-node', '.ud__tree-node-title', '.ud__tree-node-content',
      '[class*="tree-node"]', '[class*="treeNode"]',
      '[class*="checkbox"]', '[data-icon]',
      'input', 'button', 'li',
    ]
    return [...new Set(selectors.flatMap((selector) => {
      try { return [...root.querySelectorAll(selector)] } catch { return [] }
    }))].filter(visible).slice(0, 500)
  }

  const captureCssRules = (targets) => {
    const records = []
    const walk = (rules, media = null, depth = 0) => {
      if (!rules || depth > 10 || records.length >= 500) return
      for (const rule of rules) {
        if (records.length >= 500) break
        if (rule.cssRules && !rule.selectorText) {
          walk(rule.cssRules, rule.conditionText || media, depth + 1)
          continue
        }
        if (!rule.selectorText || !rule.style) continue
        const selectors = rule.selectorText.split(',').map((value) => value.trim())
        const matches = []
        for (const target of targets) {
          for (const selector of selectors) {
            const base = selector.replace(/:(hover|focus-visible|focus|active|checked|disabled)(?:\([^)]*\))?/g, '')
            try {
              if (target.matches(base)) matches.push(selector)
            } catch { /* ignore unsupported selectors */ }
          }
        }
        if (matches.length) records.push({ selectors: [...new Set(matches)], media, declarations: rule.style.cssText })
      }
    }
    for (const sheet of document.styleSheets) {
      try { walk(sheet.cssRules) } catch { /* cross-origin stylesheet */ }
    }
    return records
  }

  const state = {
    startedAt: new Date().toISOString(),
    url: location.href,
    states: [],
    errors: [],
  }

  const capture = async (label) => {
    await sleep(250)
    const { label: fieldLabel, field, selector } = findField()
    const popups = findPopupRoots()
    const targets = [fieldLabel, field, selector, ...popups].filter(Boolean)
    const record = {
      label,
      capturedAt: new Date().toISOString(),
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      fieldLabel: snapshot(fieldLabel),
      field: snapshot(field),
      selector: snapshot(selector),
      popups: popups.map((root) => ({
        root: snapshot(root),
        html: trim(root.outerHTML, 30000),
        elements: treeElements(root).map(snapshot),
      })),
      cssRules: captureCssRules(targets),
    }
    state.states.push(record)
    console.info(`[PM-T003 HRBP tree] 已采集状态：${label}，popup=${popups.length}`)
    return record
  }

  const stop = async ({ copy = true, silent = false } = {}) => {
    const result = {
      meta: {
        url: location.href,
        startedAt: state.startedAt,
        capturedAt: new Date().toISOString(),
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        userAgent: navigator.userAgent,
        note: '只读采集添加 HRBP 的权限范围选择器及部门树视觉参数；未读取 Cookie/Token，未保存或提交表单。',
      },
      states: state.states,
      errors: state.errors,
    }
    const json = JSON.stringify(result, null, 2)
    if (!silent) console.log(json)
    if (copy) {
      try {
        await navigator.clipboard.writeText(json)
        if (!silent) console.log('%c✅ JSON 已复制，请连同完整弹窗截图一起返回给 Claude', 'color:#16803c;font-weight:bold')
      } catch {
        if (!silent) console.warn('剪贴板写入失败，请手工复制控制台中的 JSON')
      }
    }
    delete window[KEY]
    return result
  }

  window[KEY] = { state, capture, stop }

  const located = findField()
  const { selector } = located
  if (!selector) {
    const diagnostics = {
      href: location.href,
      frames: window.frames.length,
      permissionTextFound: !!findTextElement('权限范围'),
      visiblePlaceholders: [...document.querySelectorAll('input[placeholder]')]
        .filter(visible)
        .map((el) => el.getAttribute('placeholder'))
        .filter(Boolean)
        .slice(0, 30),
      visibleSelectCandidates: [...document.querySelectorAll(
        '.ud__select__selector, [class*="select__selector"], [role="combobox"]'
      )]
        .filter(visible)
        .map((el) => ({ selector: selectorHint(el), text: trim(normalize(el.textContent), 160) }))
        .slice(0, 30),
    }
    state.errors.push({
      message: '未找到「权限范围」选择器。请确认已打开「添加 HRBP」弹窗。',
      diagnostics,
    })
    console.error(state.errors[0].message, diagnostics)
    return
  }

  await capture('default-closed')
  const trigger = selector.closest('[role="combobox"], button') || selector
  trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
  trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }))
  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  await sleep(600)
  await capture('opened')

  console.info('%c✅ PM-T003 部门树采集已启动', 'color:#3370ff;font-weight:bold')
  console.info('请手工展开 2～3 层节点后执行：window.__pmT003HrbpTreeCapture.capture("expanded")')
  console.info('如需采集搜索态，输入关键词后执行：window.__pmT003HrbpTreeCapture.capture("searched")')
  console.info('完成后执行：window.__pmT003HrbpTreeCapture.stop()')
})()
