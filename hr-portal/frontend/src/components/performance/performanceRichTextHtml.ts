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
      if (/^(https?:|mailto:)/i.test(href)) {
        next.setAttribute('href', href)
        next.setAttribute('target', '_blank')
        next.setAttribute('rel', 'noopener noreferrer')
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
