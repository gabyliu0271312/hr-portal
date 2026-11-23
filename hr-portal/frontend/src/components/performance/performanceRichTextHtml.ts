export function performanceRichTextUrl(value: string) {
  if (!/^(https?:\/\/|mailto:)/i.test(value) || /[\s\u0000-\u001f\u007f]/.test(value)) return null
  try {
    const url = new URL(value)
    return !url.username && !url.password && (url.protocol === 'mailto:' ? Boolean(url.pathname) : Boolean(url.hostname)) ? value : null
  } catch { return null }
}

export function isFeishuDocumentUrl(value: string) {
  if (!performanceRichTextUrl(value)) return false
  const url = new URL(value)
  return url.protocol === 'https:' && /(^|\.)feishu\.cn$/.test(url.hostname) && !url.port && /^\/(docx|docs|wiki|sheets|base|file)\/[a-zA-Z0-9]+\/?$/.test(url.pathname)
}

export function linkifyPerformanceRichText(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let node = walker.nextNode() as Text | null
  while (node) {
    if (!node.parentElement?.closest('a')) nodes.push(node)
    node = walker.nextNode() as Text | null
  }
  for (const text of nodes) {
    const pattern = /(?:https?:\/\/|mailto:)[^\s<>"​，。；！？、【】「」（）]+/gi
    const fragment = document.createDocumentFragment()
    let offset = 0
    for (const match of text.data.matchAll(pattern)) {
      let value = match[0].replace(/[.,;:!?]+$/, '')
      while (value.endsWith(')') && (value.match(/\)/g)?.length || 0) > (value.match(/\(/g)?.length || 0)) value = value.slice(0, -1)
      if (!performanceRichTextUrl(value)) continue
      fragment.appendChild(document.createTextNode(text.data.slice(offset, match.index)))
      const anchor = document.createElement('a')
      anchor.setAttribute('href', value)
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      anchor.textContent = value
      fragment.appendChild(anchor)
      offset = match.index! + value.length
    }
    if (!offset) continue
    fragment.appendChild(document.createTextNode(text.data.slice(offset)))
    text.replaceWith(fragment)
  }
}

const allowedTags = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'OL', 'UL', 'LI', 'A', 'P', 'DIV', 'BR', 'SPAN'])
const dangerousTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH'])
const allowedClasses: Record<string, string[]> = {
  DIV: ['ace-line', 'list-div', 'list-indent1'],
  OL: ['list-number1', 'r-list', 'r-list-number'],
  UL: ['list-bullet1', 'r-list', 'r-list-bullet'],
}

export function sanitizePerformanceRichTextHtml(value: unknown) {
  const template = document.createElement('template')
  template.innerHTML = String(value || '')
  const clean = document.createElement('div')
  const visit = (node: Node, parent: HTMLElement) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.textContent || ''))
      return
    }
    if (!(node instanceof HTMLElement) || dangerousTags.has(node.tagName)) return
    if (!allowedTags.has(node.tagName)) {
      Array.from(node.childNodes).forEach(child => visit(child, parent))
      return
    }
    const next = document.createElement(node.tagName.toLowerCase())
    const classes = (node.getAttribute('class') || '').split(/\s+/).filter(value => allowedClasses[node.tagName]?.includes(value))
    if (classes.length) next.setAttribute('class', classes.join(' '))
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || ''
      const safeHref = performanceRichTextUrl(href)
      if (safeHref) {
        next.setAttribute('href', safeHref)
        next.setAttribute('target', '_blank')
        next.setAttribute('rel', 'noopener noreferrer')
        const title = (node.getAttribute('data-title') || node.getAttribute('title') || '').trim()
        if (title && !node.textContent?.trim()) next.appendChild(document.createTextNode(title.slice(0, 500)))
      }
    } else if (node.tagName === 'DIV') {
      if (node.getAttribute('data-node') === 'true') next.setAttribute('data-node', 'true')
      if (node.getAttribute('dir') === 'auto') next.setAttribute('dir', 'auto')
    } else if (node.tagName === 'SPAN') {
      for (const attribute of ['data-string', 'data-enter', 'data-leaf']) if (node.getAttribute(attribute) === 'true') next.setAttribute(attribute, 'true')
    } else if (node.tagName === 'OL' || node.tagName === 'UL' || node.tagName === 'LI') {
      const attributes = node.tagName === 'LI' ? ['start', 'data-start'] : ['start', 'data-start', 'data-origin-start']
      for (const attribute of attributes) if (/^[1-9]\d{0,5}$/.test(node.getAttribute(attribute) || '')) next.setAttribute(attribute, node.getAttribute(attribute)!)
    }
    Array.from(node.childNodes).forEach(child => visit(child, next))
    if (!/^(OL|UL|BR)$/.test(node.tagName)) {
      const weight = node.style.fontWeight
      const bold = /^(bold|bolder)$/i.test(weight) || (Number(weight) >= 600 && Number(weight) <= 1000)
      const italic = /^(italic|oblique)(?:\s|$)/i.test(node.style.fontStyle)
      const underline = /\bunderline\b/i.test(`${node.style.textDecoration} ${node.style.textDecorationLine}`) || node.classList.contains('underline')
      for (const tag of [bold ? 'strong' : '', italic ? 'em' : '', underline ? 'u' : ''].filter(Boolean)) {
        const wrapper = document.createElement(tag)
        while (next.firstChild) wrapper.appendChild(next.firstChild)
        next.appendChild(wrapper)
      }
    }
    parent.appendChild(next)
  }
  Array.from(template.content.childNodes).forEach(node => visit(node, clean))
  return clean.innerHTML
}
