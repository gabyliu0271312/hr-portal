// PM-T003「添加校准规则」人员结果弹层预武装采集脚本 v5
// 重要：必须在人员弹层打开前运行本脚本。
// 用法：
// 1. 只打开「添加校准规则」抽屉，不要先点击人员输入框。
// 2. 在 DevTools Console 执行本脚本。
// 3. 看到页面上的“采集已就绪”提示后，回到页面手动点击并输入关键词。
// 4. 弹层一出现，脚本会自动抓取并下载 JSON；无需再把鼠标移回 Console。
// 5. 脚本只读取 DOM，不点击、不输入、不选择人员、不保存或提交。

(() => {
  const CONFIG = {
    armedTimeoutMs: 120000,
    maxOptions: 20,
    maxVisualElements: 160,
    copyToClipboard: true,
    downloadJson: true,
  }

  const now = () => new Date().toISOString()
  const round = (value) => Math.round(value * 1000) / 1000
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const rectOf = (element) => {
    if (!element) return null
    const rect = element.getBoundingClientRect()
    return {
      x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height),
      top: round(rect.top), right: round(rect.right), bottom: round(rect.bottom), left: round(rect.left),
    }
  }
  const isVisible = (element) => {
    if (!(element instanceof Element)) return false
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity) !== 0
      && rect.width > 0
      && rect.height > 0
  }
  const selectorHint = (element) => {
    if (!element) return null
    const classes = [...element.classList].slice(0, 6).map((name) => `.${CSS.escape(name)}`).join('')
    return `${element.tagName.toLowerCase()}${element.id ? `#${CSS.escape(element.id)}` : ''}${classes}`
  }
  const STYLE_PROPS = [
    'display', 'position', 'z-index', 'overflow-x', 'overflow-y',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'color', 'background-color',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-radius', 'box-shadow', 'opacity', 'cursor',
    'font-family', 'font-size', 'font-weight', 'line-height',
    'white-space', 'text-overflow', 'text-align', 'align-items', 'justify-content', 'gap',
  ]
  const stylesOf = (element) => {
    if (!element) return null
    const computed = getComputedStyle(element)
    return Object.fromEntries(STYLE_PROPS.map((property) => [property, computed.getPropertyValue(property)]))
  }
  const hashText = (text) => {
    let hash = 2166136261
    for (const character of text) {
      hash ^= character.codePointAt(0)
      hash = Math.imul(hash, 16777619)
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
  }
  const textMetadata = (element) => {
    const text = (element?.textContent || '').replace(/\s+/g, ' ').trim()
    return { text_length: text.length, text_hash: hashText(text) }
  }
  const snapshotElement = (element, role) => element ? {
    role,
    tag: element.tagName.toLowerCase(),
    selector_hint: selectorHint(element),
    class_name: element.className?.toString() || '',
    bbox: rectOf(element),
    styles: stylesOf(element),
    aria: {
      role: element.getAttribute('role'),
      expanded: element.getAttribute('aria-expanded'),
      selected: element.getAttribute('aria-selected'),
      label: element.getAttribute('aria-label'),
      controls: element.getAttribute('aria-controls'),
      owns: element.getAttribute('aria-owns'),
    },
  } : null
  const distanceBetween = (leftElement, rightElement) => {
    const left = leftElement.getBoundingClientRect()
    const right = rightElement.getBoundingClientRect()
    const dx = Math.max(left.left - right.right, right.left - left.right, 0)
    const dy = Math.max(left.top - right.bottom, right.top - left.bottom, 0)
    return Math.sqrt(dx * dx + dy * dy)
  }

  window.__calibrationPersonPopupCapture?.cleanup?.()

  const drawer = [...document.querySelectorAll('[role="dialog"], .ud__drawer, [class*="drawer"]')].find((element) => {
    const title = element.querySelector('.ud__drawer__header__title, [class*="drawer__header"]')?.textContent || element.textContent || ''
    return title.includes('添加校准规则')
  })
  if (!drawer) throw new Error('未找到“添加校准规则”抽屉。请先打开抽屉。')

  let personSelector = [...drawer.querySelectorAll('.ud__select__selector-multiple')].filter(isVisible)[0]
  let personInput = personSelector?.querySelector('input.ud__select__selector__search__input, input.ud__native-input, input')
  if (!(personInput instanceof HTMLInputElement)) throw new Error('未找到第一个条件组的人员输入框。')

  const status = document.createElement('div')
  status.id = 'calibration-person-capture-status'
  Object.assign(status.style, {
    position: 'fixed', top: '16px', right: '16px', zIndex: '2147483647', maxWidth: '440px',
    padding: '12px 16px', borderRadius: '8px', background: '#1456f0', color: '#fff',
    boxShadow: '0 8px 24px rgba(31,35,41,.24)', font: '600 14px/22px sans-serif',
    pointerEvents: 'none', whiteSpace: 'pre-wrap',
  })
  document.body.appendChild(status)
  const downloadButton = document.createElement('button')
  downloadButton.type = 'button'
  downloadButton.textContent = '下载采集 JSON'
  Object.assign(downloadButton.style, {
    position: 'fixed', top: '92px', right: '16px', zIndex: '2147483647', display: 'none',
    padding: '8px 14px', border: '0', borderRadius: '6px', background: '#fff', color: '#1456f0',
    boxShadow: '0 4px 12px rgba(31,35,41,.18)', font: '600 14px/22px sans-serif', cursor: 'pointer',
  })
  document.body.appendChild(downloadButton)
  let capturedJson = ''
  const downloadJson = () => {
    if (!capturedJson) return
    const blob = new Blob([capturedJson], { type: 'application/json;charset=utf-8' })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = `calibration-person-popup-armed-${Date.now()}.json`
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    setTimeout(() => { URL.revokeObjectURL(anchor.href); anchor.remove() }, 1000)
  }
  downloadButton.addEventListener('click', downloadJson)
  const setStatus = (message, tone = 'working') => {
    status.textContent = message
    status.style.background = tone === 'success' ? '#16803c' : tone === 'error' ? '#d83931' : '#1456f0'
  }

  const refreshPersonTarget = () => {
    const currentRoot = [...drawer.querySelectorAll('.ud__select__selector-multiple')].filter(isVisible)[0]
    const currentInput = currentRoot?.querySelector('input.ud__select__selector__search__input, input.ud__native-input, input')
    if (currentRoot && currentInput instanceof HTMLInputElement) {
      personSelector = currentRoot
      personInput = currentInput
    }
  }

  personSelector.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' })
  setStatus('采集已就绪。\n请回到页面，点击人员输入框并输入关键词；弹层出现后会自动采集。')

  const popupSelector = [
    '[role="listbox"]', '[role="menu"]',
    '.ud__select-dropdown', '.ud__select__dropdown', '.ud__select__popup',
    '.ud__dropdown-menu', '.ud__popup',
    '[class*="selectDropdown"]', '[class*="SelectDropdown"]', '[class*="select-dropdown"]',
    '[class*="dropdown"]', '[class*="Dropdown"]',
    '[class*="popup"]', '[class*="Popup"]', '[data-popper-placement]',
  ].join(',')
  const popupRootFor = (element) => element.closest('[role="listbox"], [role="menu"], .ud__select-dropdown, .ud__select__dropdown, .ud__dropdown-menu, [data-popper-placement]') || element
  const popupOptions = (popup) => {
    if (!popup) return []
    const explicit = [...popup.querySelectorAll('[role="option"], li, [class*="option"], [class*="Option"]')].filter(isVisible)
    if (explicit.length) return [...new Set(explicit)]
    return [...popup.querySelectorAll('div, button')].filter((element) => {
      if (!isVisible(element)) return false
      const rect = element.getBoundingClientRect()
      const text = (element.textContent || '').trim()
      return rect.height >= 24 && rect.height <= 80 && text.length > 0 && element.children.length <= 5
    })
  }
  const candidateScore = (element) => {
    refreshPersonTarget()
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    const className = element.className?.toString() || ''
    const role = element.getAttribute('role') || ''
    const optionCount = popupOptions(element).length
    const distance = distanceBetween(element, personSelector)
    const widthRatio = rect.width / personSelector.getBoundingClientRect().width
    let score = 0
    if (role === 'listbox') score += 160
    if (role === 'menu') score += 80
    if (/select|dropdown/i.test(className)) score += 100
    if (/popup|popper/i.test(className)) score += 60
    if (element.hasAttribute('data-popper-placement')) score += 100
    if (['absolute', 'fixed'].includes(style.position)) score += 40
    if (optionCount) score += 100 + Math.min(optionCount, 20)
    if (distance <= 8) score += 140
    else if (distance <= 80) score += 100
    else if (distance <= 240) score += 50
    if (widthRatio >= 0.7 && widthRatio <= 1.5) score += 50
    if (rect.top >= personSelector.getBoundingClientRect().bottom - 8) score += 30
    return { element, score, distance: round(distance), option_count_hint: optionCount }
  }
  const findPopup = () => {
    refreshPersonTarget()
    const linkedId = personInput.getAttribute('aria-controls') || personInput.getAttribute('aria-owns')
    const linked = linkedId ? document.getElementById(linkedId) : null
    if (linked && isVisible(linked)) return linked

    const explicit = [...document.querySelectorAll(popupSelector)].filter(isVisible)
    const positioned = [...document.body.querySelectorAll('*')].filter((element) => {
      if (!isVisible(element) || element === drawer || element.contains(drawer) || element.contains(personSelector) || element === status || status.contains(element)) return false
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return ['absolute', 'fixed'].includes(style.position)
        && rect.width >= 120
        && rect.height >= 24
        && rect.height <= Math.max(window.innerHeight, 800)
        && (element.textContent || '').trim().length > 0
    })
    const candidates = [...new Set([...explicit, ...positioned])]
      .map(popupRootFor)
      .filter((element) => element !== drawer && !element.contains(drawer) && !element.contains(personSelector))
      .map(candidateScore)
      .sort((left, right) => right.score - left.score || left.distance - right.distance)
    return { selected: candidates[0]?.element || null, ranked: candidates }
  }
  const visualSnapshot = (popup) => [...popup.querySelectorAll('*')]
    .filter(isVisible)
    .slice(0, CONFIG.maxVisualElements)
    .map((element, index) => ({
      index,
      ...textMetadata(element),
      element: snapshotElement(element, 'popup-visual-element'),
      parent_selector_hint: selectorHint(element.parentElement),
    }))
  const svgSnapshot = (popup) => [...popup.querySelectorAll('svg')].filter(isVisible).map((element, index) => ({
    index,
    data_icon: element.getAttribute('data-icon'),
    viewBox: element.getAttribute('viewBox'),
    bbox: rectOf(element),
    styles: stylesOf(element),
    paths: [...element.querySelectorAll('path')].map((path) => ({
      d: path.getAttribute('d'), fill: path.getAttribute('fill'), stroke: path.getAttribute('stroke'),
    })),
  }))
  const portalChain = (popup) => {
    const result = []
    let ancestor = popup
    while (ancestor && ancestor !== document.body && result.length < 12) {
      result.push(snapshotElement(ancestor, ancestor === popup ? 'popup-root' : 'popup-ancestor'))
      ancestor = ancestor.parentElement
    }
    return result
  }

  const originalInputValue = personInput.value
  const observer = new MutationObserver(() => captureIfReady())
  const stopTimer = setTimeout(() => {
    observer.disconnect()
    clearInterval(pollTimer)
    setStatus('⏱ 监听超时：弹层未被检测到。请重新运行脚本后再手动输入。', 'error')
  }, CONFIG.armedTimeoutMs)
  let pollTimer = null
  let captured = false

  const captureIfReady = () => {
    if (captured) return
    refreshPersonTarget()
    if (!personInput.value.trim()) return
    const selection = findPopup()
    const popup = selection.selected
    if (!popup || !isVisible(popup) || selection.ranked[0].score < 100) return
    captured = true
    observer.disconnect()
    clearInterval(pollTimer)
    clearTimeout(stopTimer)
    popup.setAttribute('data-capture-target', 'calibration-person-result-popup')
    personSelector.setAttribute('data-capture-target', 'calibration-person-select')
    personInput.setAttribute('data-capture-target', 'calibration-person-search-input')

    const options = popupOptions(popup)
    const result = {
      schema_version: 5,
      interaction_id: 'calibration-person-result-popup-armed',
      source: {
        url: location.href,
        viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
        captured_at: now(),
      },
      precondition: '采集器先运行，用户随后手动输入关键词；弹层出现后立即采集。',
      safety: { read_only: true, selected_person: false, saved_or_submitted: false, search_text_redacted: true, matched_person_text_redacted: true },
      search_control: {
        input_value_length: personInput.value.length,
        input: snapshotElement(personInput, 'person-search-input'),
        selector_root: snapshotElement(personSelector, 'person-select-root'),
      },
      popup: {
        root: snapshotElement(popup, 'person-result-popup'),
        option_count: options.length,
        options: options.slice(0, CONFIG.maxOptions).map((option, index) => ({
          index,
          ...textMetadata(option),
          element: snapshotElement(option, 'person-result-option'),
          avatar: snapshotElement(option.querySelector('img, [class*="avatar"], [class*="Avatar"]'), 'person-avatar'),
        })),
        portal_chain: portalChain(popup),
        visual_elements: visualSnapshot(popup),
        svg: svgSnapshot(popup),
      },
      candidate_selection: {
        selected_score: selection.ranked[0].score,
        selected_distance: selection.ranked[0].distance,
        candidates: selection.ranked.slice(0, 12).map(({ element, score, distance, option_count_hint }) => ({
          score, distance, option_count_hint, selector_hint: selectorHint(element), bbox: rectOf(element), ...textMetadata(element),
        })),
      },
      assertions: {
        search_input_has_value: personInput.value.trim().length > 0,
        result_popup_visible: isVisible(popup),
        result_popup_has_options: options.length > 0,
        result_popup_near_person_selector: distanceBetween(popup, personSelector) < 240,
      },
    }

    const cleanup = () => {
      personSelector.removeAttribute('data-capture-target')
      personInput.removeAttribute('data-capture-target')
      popup.removeAttribute('data-capture-target')
      status.remove()
      downloadButton.remove()
    }
    window.__calibrationPersonPopupCapture = { result, cleanup, download: downloadJson, target: personInput, popup }

    const json = JSON.stringify(result, null, 2)
    capturedJson = json
    console.log(json)
    console.table(result.assertions)
    if (CONFIG.copyToClipboard) {
      navigator.clipboard?.writeText(json)
        .then(() => console.log('%c✅ 弹层采集结果已复制到剪贴板', 'color:#16803c;font-weight:bold'))
        .catch(() => console.warn('剪贴板写入被拒，请手动复制控制台中的 JSON。'))
    }
    if (CONFIG.downloadJson) {
      downloadJson()
      downloadButton.style.display = 'block'
    }
    setStatus('✅ 已自动采集人员结果弹层。\n如浏览器拦截自动下载，请点击右上角“下载采集 JSON”。', 'success')
  }

  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'aria-expanded', 'hidden'] })
  pollTimer = setInterval(captureIfReady, 100)
  captureIfReady()
})()
