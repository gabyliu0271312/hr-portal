<template>
  <div class="rich-editor-host" :class="[`rich-editor-host--${variant}`, { 'rich-editor-host--readonly': readonly }]">
    <PerformanceRichTextBox
      class="next-remix-rich-text-editor"
      :readonly="readonly"
      :hide-toolbar="hideToolbar"
      :variant="variant === 'tag' ? 'default' : variant"
      :active="active"
      @before-command="rememberSelection"
      @command="command"
    >
      <div v-if="linkOpen" class="link-popover">
        <input v-model="url" aria-label="链接地址" placeholder="请输入链接地址" @keydown.enter.prevent="applyLink" />
        <button type="button" @click="applyLink">应用</button>
      </div>
      <div class="next-remix-rich-text-editor-content">
        <span v-if="isBlank" class="rich-placeholder">{{ placeholder }}</span>
        <div
          ref="editor"
          class="rich-input ace-editor zone-container editor-kit-container next-remix-rich-text-editor-textarea notranslate chrome window chrome88"
          :class="inputClass"
          :contenteditable="readonly ? 'false' : 'true'"
          data-zone-id="0"
          data-zone-container="*"
          data-slate-editor="true"
          :data-placeholder="placeholder"
          spellcheck="false"
          @beforeinput="insertPendingText"
          @input="emitHtml"
          @keydown="keyHandler"
          @keyup="rememberSelection"
          @mouseup="rememberSelection"
          @focus="emit('activate')"
          @blur="emit('queue-save')"
          @paste="paste"
        />
      </div>
    </PerformanceRichTextBox>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import PerformanceRichTextBox from './PerformanceRichTextBox.vue'

type CommandKey = 'bold' | 'italic' | 'underline' | 'insertOrderedList' | 'insertUnorderedList' | 'link'
type MarkKey = 'bold' | 'italic' | 'underline'
type Variant = 'default' | 'task-entry' | 'tag'

const props = withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
  readonly?: boolean
  hideToolbar?: boolean
  variant?: Variant
  inputClass?: string
}>(), {
  modelValue: '',
  placeholder: '请输入内容',
  readonly: false,
  hideToolbar: false,
  variant: 'default',
  inputClass: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  activate: []
  'queue-save': []
}>()

const editor = ref<HTMLElement | null>(null)
const linkOpen = ref(false)
const url = ref('')
const selection = ref<Range | null>(null)
let lastEmitted: string | undefined
const pendingMarks = reactive<Record<MarkKey, boolean>>({ bold: false, italic: false, underline: false })
const active = reactive<Record<CommandKey, boolean>>({ bold: false, italic: false, underline: false, insertOrderedList: false, insertUnorderedList: false, link: false })
const emptyHtml = '<div class="ace-line" data-node="true" dir="auto"><span data-string="true" data-enter="true" data-leaf="true">​</span></div>'
const isBlank = ref(true)

const allowedTags = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'OL', 'UL', 'LI', 'A', 'P', 'DIV', 'BR', 'SPAN'])
const dangerousTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH'])

function sanitizeHtml(value: unknown) {
  const template = document.createElement('template')
  template.innerHTML = String(value || '')
  const clean = document.createElement('div')
  const visit = (node: Node, parent: HTMLElement) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.textContent || ''))
      return
    }
    if (!(node instanceof HTMLElement)) return
    if (dangerousTags.has(node.tagName)) return
    if (!allowedTags.has(node.tagName)) {
      Array.from(node.childNodes).forEach(child => visit(child, parent))
      return
    }
    const next = document.createElement(node.tagName.toLowerCase())
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || ''
      if (/^(https?:|mailto:)/i.test(href)) {
        next.setAttribute('href', href)
        next.setAttribute('target', '_blank')
        next.setAttribute('rel', 'noopener noreferrer')
      }
    } else if (node.tagName === 'DIV') {
      const classes = (node.getAttribute('class') || '').split(/\s+/).filter(value => value === 'ace-line' || value === 'list-div')
      if (classes.length) next.setAttribute('class', classes.join(' '))
      if (node.getAttribute('data-node') === 'true') next.setAttribute('data-node', 'true')
      if (node.getAttribute('dir') === 'auto') next.setAttribute('dir', 'auto')
    } else if (node.tagName === 'SPAN') {
      for (const attribute of ['data-string', 'data-enter', 'data-leaf']) if (node.getAttribute(attribute) === 'true') next.setAttribute(attribute, 'true')
      if (node.hasAttribute('style')) next.setAttribute('style', node.getAttribute('style') || '')
      if (node.classList.contains('underline')) next.classList.add('underline')
    } else if (node.tagName === 'OL' || node.tagName === 'UL') {
      const classes = (node.getAttribute('class') || '').split(/\s+/).filter(value => value === 'list-number1' || value === 'list-bullet1' || value === 'r-list' || value === 'r-list-number' || value === 'r-list-bullet')
      if (classes.length) next.setAttribute('class', classes.join(' '))
      for (const attribute of ['start', 'data-start', 'data-origin-start']) if (node.hasAttribute(attribute)) next.setAttribute(attribute, node.getAttribute(attribute) || '')
    } else if (node.tagName === 'LI') {
      for (const attribute of ['start', 'data-start']) if (node.hasAttribute(attribute)) next.setAttribute(attribute, node.getAttribute(attribute) || '')
    }
    Array.from(node.childNodes).forEach(child => visit(child, next))
    parent.appendChild(next)
  }
  Array.from(template.content.childNodes).forEach(node => visit(node, clean))
  const convertStyles = (root: HTMLElement) => {
    Array.from(root.querySelectorAll('span')).forEach(span => {
      const style = span.getAttribute('style') || ''
      const bold = /(?:^|;)\s*font-weight\s*:\s*(?:bold|[6-9]00)/i.test(style)
      const italic = /(?:^|;)\s*font-style\s*:\s*italic/i.test(style)
      const underline = /(?:^|;)\s*text-decoration(?:-line)?\s*:\s*[^;]*underline/i.test(style) || span.classList.contains('underline')
      for (const tag of [bold ? 'strong' : '', italic ? 'em' : '', underline ? 'u' : ''].filter(Boolean)) {
        const wrapper = document.createElement(tag)
        while (span.firstChild) wrapper.appendChild(span.firstChild)
        span.appendChild(wrapper)
      }
    })
    root.querySelectorAll('[style],.underline').forEach(element => { element.removeAttribute('style'); element.classList.remove('underline'); if (!element.className) element.removeAttribute('class') })
  }
  convertStyles(clean)
  return clean.innerHTML
}

function emptyLeaf() {
  const leaf = document.createElement('span')
  leaf.dataset.string = 'true'
  leaf.dataset.enter = 'true'
  leaf.dataset.leaf = 'true'
  leaf.textContent = '​'
  return leaf
}

function ensureTextLeaves(block: HTMLElement) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let node = walker.nextNode()
  while (node) {
    const text = node as Text
    if (text.parentElement && !text.parentElement.closest('[data-leaf="true"]') && text.data) textNodes.push(text)
    node = walker.nextNode()
  }
  textNodes.forEach(text => {
    const span = document.createElement('span')
    span.dataset.string = 'true'
    span.dataset.leaf = 'true'
    text.parentNode?.insertBefore(span, text)
    span.appendChild(text)
  })
}

function ensureEndLeaf(block: HTMLElement) {
  if (!block.querySelector(':scope > [data-enter="true"]')) block.appendChild(emptyLeaf())
}

function plainBlock(source?: Node) {
  const block = document.createElement('div')
  block.className = 'ace-line'
  block.dataset.node = 'true'
  block.dir = 'auto'
  if (source) {
    while (source.firstChild) block.appendChild(source.firstChild)
  }
  ensureTextLeaves(block)
  if (!block.childNodes.length) block.appendChild(emptyLeaf())
  return block
}

function normalizeHtml(value: unknown) {
  const root = document.createElement('div')
  root.innerHTML = sanitizeHtml(value)
  const blocks: HTMLElement[] = []
  let inline = document.createDocumentFragment()
  const flushInline = () => {
    if (inline.childNodes.length) blocks.push(plainBlock(inline))
    inline = document.createDocumentFragment()
  }
  const addNode = (node: Node) => {
    if (node instanceof HTMLElement && node.classList.contains('ace-line')) {
      flushInline()
      const list = node.querySelector(':scope > ol, :scope > ul') as HTMLElement | null
      if (list) {
        const sources = Array.from(list.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName === 'LI')
        sources.forEach(source => blocks.push(blockListWrapper(list.tagName as 'OL' | 'UL', source)))
      } else {
        const block = plainBlock(node)
        block.className = node.className || 'ace-line'
        block.dataset.node = 'true'
        block.dir = 'auto'
        blocks.push(block)
      }
      return
    }
    if (node instanceof HTMLElement && (node.tagName === 'OL' || node.tagName === 'UL')) {
      flushInline()
      Array.from(node.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName === 'LI').forEach(item => blocks.push(blockListWrapper(node.tagName as 'OL' | 'UL', item)))
      return
    }
    if (node instanceof HTMLElement && (node.tagName === 'P' || node.tagName === 'DIV')) {
      flushInline()
      const childBlocks = Array.from(node.children).filter(child => child instanceof HTMLElement && (child.tagName === 'P' || child.tagName === 'DIV' || child.tagName === 'OL' || child.tagName === 'UL'))
      if (childBlocks.length) {
        Array.from(node.childNodes).forEach(addNode)
      } else blocks.push(plainBlock(node))
      return
    }
    if (node instanceof HTMLBRElement) {
      flushInline()
      blocks.push(plainBlock())
      return
    }
    inline.appendChild(node.cloneNode(true))
  }
  Array.from(root.childNodes).forEach(addNode)
  flushInline()
  return blocks.length ? blocks.map(block => block.outerHTML).join('') : emptyHtml
}

function directList(block: HTMLElement) {
  return Array.from(block.children).find(child => child.tagName === 'OL' || child.tagName === 'UL') as HTMLOListElement | HTMLUListElement | undefined
}

function selectedBlocks(range: Range) {
  if (!editor.value) return [] as HTMLElement[]
  if (range.collapsed) {
    const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement
    const block = start?.closest('.ace-line')
    return block instanceof HTMLElement && editor.value.contains(block) ? [block] : []
  }
  return Array.from(editor.value.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node.classList.contains('ace-line') && (() => { try { return range.intersectsNode(node) } catch { return false } })())
}

function selectedTextNodes(range: Range) {
  if (!editor.value) return [] as Text[]
  const nodes: Text[] = []
  const walker = document.createTreeWalker(editor.value, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const text = node as Text
    if (text.data.replace(/​/g, '').trim()) {
      try { if (range.intersectsNode(text)) nodes.push(text) } catch { /* selection may have been detached */ }
    }
    node = walker.nextNode()
  }
  return nodes
}

function hasMark(node: Text, state: MarkKey) {
  let element = node.parentElement
  while (element && editor.value?.contains(element)) {
    if (state === 'bold' && (/^(STRONG|B)$/.test(element.tagName) || element.style.fontWeight === 'bold' || Number(element.style.fontWeight) >= 600)) return true
    if (state === 'italic' && (/^(EM|I)$/.test(element.tagName) || element.style.fontStyle === 'italic')) return true
    if (state === 'underline' && (element.tagName === 'U' || element.classList.contains('underline') || element.style.textDecoration.includes('underline'))) return true
    element = element.parentElement
  }
  return false
}

function styleState(range: Range | null) {
  if (!range || !editor.value || !editor.value.contains(range.startContainer) || !editor.value.contains(range.endContainer)) return
  const textNodes = selectedTextNodes(range)
  const caretText = range.collapsed && range.startContainer instanceof Text && range.startContainer.data.replace(/​/g, '').length ? range.startContainer : null
  if (caretText) {
    pendingMarks.bold = hasMark(caretText, 'bold')
    pendingMarks.italic = hasMark(caretText, 'italic')
    pendingMarks.underline = hasMark(caretText, 'underline')
  }
  active.bold = range.collapsed ? pendingMarks.bold : textNodes.length > 0 && textNodes.every(node => hasMark(node, 'bold'))
  active.italic = range.collapsed ? pendingMarks.italic : textNodes.length > 0 && textNodes.every(node => hasMark(node, 'italic'))
  active.underline = range.collapsed ? pendingMarks.underline : textNodes.length > 0 && textNodes.every(node => hasMark(node, 'underline'))
  const blocks = selectedBlocks(range)
  active.insertOrderedList = blocks.length > 0 && blocks.every(block => directList(block)?.tagName === 'OL')
  active.insertUnorderedList = blocks.length > 0 && blocks.every(block => directList(block)?.tagName === 'UL')
}

function rememberSelection() {
  const current = document.getSelection()
  if (!current?.rangeCount || !editor.value || !editor.value.contains(current.anchorNode) || !editor.value.contains(current.focusNode)) return
  selection.value = current.getRangeAt(0).cloneRange()
  styleState(selection.value)
  emit('activate')
}

function restoreSelection() {
  if (!selection.value || !editor.value?.contains(selection.value.startContainer) || !editor.value.contains(selection.value.endContainer)) return false
  const current = document.getSelection()
  current?.removeAllRanges()
  current?.addRange(selection.value)
  return true
}

function selectedFragment() {
  if (!restoreSelection()) return null
  const current = document.getSelection()
  const range = current?.rangeCount ? current.getRangeAt(0) : null
  return range && editor.value?.contains(range.startContainer) && editor.value.contains(range.endContainer) ? range : null
}

function serializeEditor() {
  return sanitizeHtml(editor.value?.innerHTML || '')
}

function emitHtml() {
  if (editor.value && !props.readonly) {
    isBlank.value = !editor.value.textContent?.replace(/​/g, '').trim()
    lastEmitted = serializeEditor()
    emit('update:modelValue', lastEmitted)
  }
  styleState(document.getSelection()?.rangeCount ? document.getSelection()!.getRangeAt(0) : null)
}

function restoreBlockSelection(blocks: HTMLElement[], collapsed: boolean) {
  if (!blocks.length || !editor.value) return
  editor.value.focus({ preventScroll: true })
  const range = document.createRange()
  const endLeaf = collapsed ? blocks[0].querySelector<HTMLElement>('[data-enter="true"]') : null
  const endText = endLeaf?.firstChild
  if (collapsed && endText instanceof Text) {
    range.setStart(endText, endText.length)
    range.collapse(true)
  } else {
    range.selectNodeContents(blocks[0])
    if (collapsed) range.collapse(false)
    else if (blocks.length > 1) range.setEnd(blocks[blocks.length - 1], blocks[blocks.length - 1].childNodes.length)
  }
  const current = document.getSelection()
  current?.removeAllRanges()
  current?.addRange(range)
  selection.value = range.cloneRange()
  styleState(range)
}

function toggleMark(tag: 'strong' | 'em' | 'u') {
  const range = selectedFragment()
  if (!range) return
  if (range.collapsed) {
    const state = tag === 'strong' ? 'bold' : tag === 'em' ? 'italic' : 'underline'
    pendingMarks[state] = !pendingMarks[state]
    active[state] = pendingMarks[state]
    editor.value?.focus({ preventScroll: true })
    restoreSelection()
    return
  }
  const blocks = selectedBlocks(range)
  const nodes = selectedTextNodes(range)
  if (!nodes.length) return
  const state = tag === 'strong' ? 'bold' : tag === 'em' ? 'italic' : 'underline'
  const selector = tag === 'strong' ? 'strong,b' : tag === 'em' ? 'em,i' : 'u'
  const removeMark = nodes.every(node => hasMark(node, state))
  if (removeMark) {
    nodes.forEach(node => {
      const wrapper = node.parentElement?.closest(selector)
      if (wrapper && editor.value?.contains(wrapper)) { wrapper.replaceWith(...Array.from(wrapper.childNodes)); return }
      const leaf = node.parentElement
      if (!leaf || !editor.value?.contains(leaf)) return
      if (state === 'bold') leaf.style.removeProperty('font-weight')
      if (state === 'italic') leaf.style.removeProperty('font-style')
      if (state === 'underline') { leaf.style.removeProperty('text-decoration'); leaf.classList.remove('underline') }
      if (!leaf.getAttribute('style')) leaf.removeAttribute('style')
    })
  } else {
    nodes.filter(node => !hasMark(node, state)).reverse().forEach(node => {
      let start = node === range.startContainer ? range.startOffset : 0
      let end = node === range.endContainer ? range.endOffset : node.length
      start = Math.max(0, Math.min(start, node.length))
      end = Math.max(start, Math.min(end, node.length))
      if (end < node.length) node.splitText(end)
      const selected = start > 0 ? node.splitText(start) : node
      const wrapper = document.createElement(tag)
      selected.parentNode?.insertBefore(wrapper, selected)
      wrapper.appendChild(selected)
    })
  }
  restoreBlockSelection(blocks, false)
  emitHtml()
}

function blockListWrapper(type: 'OL' | 'UL', source?: HTMLElement) {
  const list = document.createElement(type.toLowerCase()) as HTMLOListElement | HTMLUListElement
  list.className = type === 'OL' ? 'list-number1 r-list r-list-number' : 'list-bullet1 r-list r-list-bullet'
  const item = document.createElement('li')
  if (source) while (source.firstChild) item.appendChild(source.firstChild)
  ensureTextLeaves(item)
  ensureEndLeaf(item)
  list.appendChild(item)
  const block = document.createElement('div')
  block.className = 'ace-line list-div'
  block.dataset.node = 'true'
  block.dir = 'auto'
  block.appendChild(list)
  if (type === 'OL') block.classList.add('list-start-number1', 'ol-id-captured')
  return block
}

function renumberOrderedLists() {
  let start = 0
  Array.from(editor.value?.children || []).forEach(node => {
    if (!(node instanceof HTMLElement)) return
    const list = directList(node)
    if (list?.tagName !== 'OL') { start = 0; return }
    start += 1
    list.setAttribute('start', String(start))
    list.setAttribute('data-start', String(start))
    const item = list.querySelector(':scope > li')
    item?.setAttribute('start', String(start))
    item?.setAttribute('data-start', String(start))
    if (start === 1) list.setAttribute('data-origin-start', '1')
    else list.removeAttribute('data-origin-start')
  })
}

function toggleList(type: 'OL' | 'UL') {
  const range = selectedFragment()
  if (!range) return
  const blocks = selectedBlocks(range)
  if (!blocks.length) return
  const collapsed = range.collapsed
  const removeList = blocks.every(block => directList(block)?.tagName === type)
  const replacements = blocks.map(block => {
    const list = directList(block)
    const source = (list?.querySelector(':scope > li') as HTMLElement | null) || block
    const replacement = removeList ? plainBlock(source) : blockListWrapper(type, source)
    block.replaceWith(replacement)
    return replacement
  })
  renumberOrderedLists()
  restoreBlockSelection(replacements, collapsed)
  emitHtml()
}

function markStyles(leaf: HTMLElement) {
  if (pendingMarks.bold) leaf.style.fontWeight = 'bold'
  if (pendingMarks.italic) leaf.style.fontStyle = 'italic'
  if (pendingMarks.underline) { leaf.style.textDecoration = 'underline'; leaf.classList.add('underline') }
}

function leafMatchesPending(leaf: HTMLElement) {
  const text = leaf.firstChild
  if (!(text instanceof Text)) return false
  return hasMark(text, 'bold') === pendingMarks.bold && hasMark(text, 'italic') === pendingMarks.italic && hasMark(text, 'underline') === pendingMarks.underline
}

function insertPendingText(event: InputEvent) {
  if (props.readonly || event.inputType !== 'insertText' || !event.data) return
  const currentSelection = document.getSelection()
  const range = currentSelection?.rangeCount ? currentSelection.getRangeAt(0) : null
  if (!range || !range.collapsed || !editor.value?.contains(range.startContainer)) return
  const currentElement = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement
  const currentLeaf = currentElement?.closest('[data-leaf="true"]') as HTMLElement | null
  const hasPendingMark = pendingMarks.bold || pendingMarks.italic || pendingMarks.underline
  if (!hasPendingMark && !currentLeaf?.dataset.enter) return
  if (currentLeaf && !currentLeaf.dataset.enter && leafMatchesPending(currentLeaf)) return
  event.preventDefault()
  const leaf = document.createElement('span')
  leaf.dataset.string = 'true'
  leaf.dataset.leaf = 'true'
  leaf.textContent = event.data
  markStyles(leaf)
  const endLeaf = currentLeaf?.dataset.enter === 'true' ? currentLeaf : null
  if (endLeaf) endLeaf.before(leaf)
  else range.insertNode(leaf)
  const nextRange = document.createRange()
  nextRange.setStart(leaf.firstChild!, event.data.length)
  nextRange.collapse(true)
  currentSelection?.removeAllRanges()
  currentSelection?.addRange(nextRange)
  selection.value = nextRange.cloneRange()
  emitHtml()
  styleState(nextRange)
}

function keyHandler(event: KeyboardEvent) {
  if (props.readonly || event.isComposing) return
  rememberSelection()
  if (event.key === 'Enter') {
    event.preventDefault()
    const range = selectedFragment()
    const current = range ? selectedBlocks(range)[0] : null
    if (!current) return
    const list = directList(current)
    const block = list ? blockListWrapper(list.tagName as 'OL' | 'UL') : plainBlock()
    current.after(block)
    renumberOrderedLists()
    restoreBlockSelection([block], true)
    emitHtml()
  }
  rememberSelection()
}

function applyLink() {
  const value = url.value.trim()
  const range = selectedFragment()
  if (!range || !value || !/^(https?:|mailto:)/i.test(value)) return
  const anchor = document.createElement('a')
  anchor.href = value
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  anchor.appendChild(range.extractContents())
  range.insertNode(anchor)
  linkOpen.value = false
  url.value = ''
  selection.value = range.cloneRange()
  emitHtml()
  editor.value?.focus({ preventScroll: true })
}

function command(cmd: CommandKey) {
  if (props.readonly || !editor.value) return
  rememberSelection()
  if (!selection.value || !editor.value.contains(selection.value.startContainer) || !editor.value.contains(selection.value.endContainer)) {
    const range = document.createRange()
    range.selectNodeContents(editor.value)
    range.collapse(false)
    selection.value = range
  }
  if (cmd === 'link') {
    restoreSelection()
    active.link = !linkOpen.value
    linkOpen.value = !linkOpen.value
    return
  }
  if (cmd === 'insertOrderedList') toggleList('OL')
  else if (cmd === 'insertUnorderedList') toggleList('UL')
  else toggleMark(cmd === 'bold' ? 'strong' : cmd === 'italic' ? 'em' : 'u')
}

function paste(event: ClipboardEvent) {
  event.preventDefault()
  if (props.readonly || !editor.value) return
  rememberSelection()
  const range = selectedFragment()
  if (!range) return
  const html = event.clipboardData?.getData('text/html') || ''
  const fragment = document.createElement('template')
  if (html) fragment.innerHTML = sanitizeHtml(html)
  else fragment.content.appendChild(document.createTextNode(event.clipboardData?.getData('text/plain') || ''))
  range.deleteContents()
  range.insertNode(fragment.content)
  editor.value.innerHTML = normalizeHtml(editor.value.innerHTML)
  renumberOrderedLists()
  const blocks = Array.from(editor.value.children).filter((node): node is HTMLElement => node instanceof HTMLElement)
  restoreBlockSelection(blocks.slice(-1), true)
  emitHtml()
}

function syncEditor(value: string) {
  if (!editor.value || value === lastEmitted || (editor.value.hasChildNodes() && value === serializeEditor())) return
  const normalized = normalizeHtml(value)
  if (editor.value.innerHTML !== normalized) editor.value.innerHTML = normalized
  isBlank.value = !editor.value.textContent?.replace(/​/g, '').trim()
  lastEmitted = undefined
  renumberOrderedLists()
  selection.value = null
  syncStateFromContent()
}

function syncStateFromContent() {
  if (!editor.value) return
  const walker = document.createTreeWalker(editor.value, NodeFilter.SHOW_TEXT)
  let text = walker.nextNode()
  while (text && !text.textContent?.replace(/​/g, '').length) text = walker.nextNode()
  if (text instanceof Text) {
    pendingMarks.bold = hasMark(text, 'bold')
    pendingMarks.italic = hasMark(text, 'italic')
    pendingMarks.underline = hasMark(text, 'underline')
    active.bold = pendingMarks.bold
    active.italic = pendingMarks.italic
    active.underline = pendingMarks.underline
  }
  const blocks = Array.from(editor.value.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node.classList.contains('ace-line'))
  active.insertOrderedList = blocks.length > 0 && blocks.every(block => directList(block)?.tagName === 'OL')
  active.insertUnorderedList = blocks.length > 0 && blocks.every(block => directList(block)?.tagName === 'UL')
}

watch(() => props.modelValue, value => syncEditor(value))

watch(() => props.readonly, value => {
  if (value) linkOpen.value = false
})

onMounted(() => {
  syncEditor(props.modelValue)
  document.addEventListener('selectionchange', rememberSelection)
})

onBeforeUnmount(() => document.removeEventListener('selectionchange', rememberSelection))

defineExpose({ active, rememberSelection, command })
</script>

<style scoped>
.rich-editor-host{width:100%;max-width:100%;min-width:0;box-sizing:border-box}.rich-editor-host :deep(.next-remix-rich-text-editor){position:relative;width:100%;max-width:100%;min-width:0;box-sizing:border-box;background:#fff}.rich-editor-host :deep(.performance-rich-text-box__content){width:100%;max-width:100%;min-width:0;box-sizing:border-box}.rich-editor-host--tag :deep(.performance-rich-text-box__content){min-height:34px}.rich-editor-host :deep(.next-remix-rich-text-editor-content){position:relative;display:grid;grid-template-columns:minmax(0,1fr);width:100%;max-width:100%;min-width:0;min-height:90px;box-sizing:border-box;overflow:visible}.rich-editor-host :deep(.rich-placeholder){position:relative;grid-area:1 / 1;align-self:start;z-index:1;margin:6px 8px;color:#8f959e;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;pointer-events:none}.rich-editor-host :deep(.rich-input){grid-area:1 / 1;width:100%;max-width:100%;min-width:0;min-height:90px;padding:6px 10px;box-sizing:border-box;outline:0;white-space:pre-wrap;overflow-wrap:anywhere;overflow:visible;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif}.rich-editor-host :deep(.rich-input .ace-line){min-height:22px;margin:0}.rich-editor-host :deep(.rich-input .ace-line.list-div){min-height:22px}.rich-editor-host :deep(.rich-input ol),.rich-editor-host :deep(.rich-input ul){margin:0;padding-left:24px}.rich-editor-host :deep(.rich-input .r-list){list-style:none}.rich-editor-host :deep(.rich-input .r-list>li){position:relative;min-height:22px;list-style:none}.rich-editor-host :deep(.rich-input .r-list-bullet>li::before){position:absolute;top:8px;left:-17px;width:6px;height:6px;border-radius:50%;background:#3370ff;content:''}.rich-editor-host :deep(.rich-input .r-list-number>li::before){position:absolute;top:0;left:-24px;width:20px;color:#646a73;content:attr(data-start) '.';text-align:right}.rich-editor-host :deep(.rich-input[contenteditable="true"]){cursor:text}.rich-editor-host :deep(.rich-input[contenteditable="false"]){cursor:default}.rich-editor-host--task-entry :deep(.next-remix-rich-text-editor){min-height:124px;padding-bottom:12px;color:rgba(0,0,0,.65);font:400 14px/21px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji";cursor:default}.rich-editor-host--task-entry :deep(.next-remix-rich-text-editor-content){min-height:88px}.rich-editor-host--task-entry :deep(.rich-input){min-height:88px;flex:1;padding:4px 11px;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"}.rich-editor-host--task-entry :deep(.performance-rich-toolbar){height:36px;gap:0;padding:6px 8px 6px 4px}.rich-editor-host--task-entry :deep(.performance-rich-toolbar button){margin:0 4px;border-radius:6px}.rich-editor-host--tag :deep(.performance-rich-text-box){min-height:34px;border:0;border-radius:0;box-shadow:none}.rich-editor-host--tag :deep(.next-remix-rich-text-editor){min-height:34px;border:0;border-radius:0;box-shadow:none}.rich-editor-host--tag :deep(.next-remix-rich-text-editor-content){min-height:34px}.rich-editor-host--tag :deep(.rich-input){min-height:34px;padding:6px 8px 0 0}.rich-editor-host--tag :deep(.rich-placeholder){margin:6px 8px 0 0;font-size:14px;line-height:24px}.rich-editor-host--tag :deep(.ace-line){line-height:24px}.link-popover{position:absolute;z-index:5;top:38px;left:128px;display:flex;gap:6px;width:min(260px,calc(100% - 16px));padding:8px;box-sizing:border-box;border:1px solid #dee0e3;border-radius:6px;background:#fff;box-shadow:0 6px 24px rgba(31,35,41,.16)}.link-popover input{flex:1;min-width:0;width:100%;height:32px;padding:4px 11px;box-sizing:border-box;border:1px solid #d0d3d6;border-radius:6px;font:inherit;outline:0}.link-popover input:focus{border-color:#3370ff}.link-popover button{height:32px;padding:4px 12px;border:1px solid #3370ff;border-radius:6px;background:#3370ff;color:#fff;font:inherit;cursor:pointer}.rich-editor-host--readonly :deep(.rich-input){user-select:text}.rich-editor-host--readonly :deep(.performance-rich-toolbar){cursor:default}
</style>
