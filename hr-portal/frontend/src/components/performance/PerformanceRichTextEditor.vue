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
      <div class="next-remix-rich-text-editor-content" :data-rich-placeholder="isBlank ? placeholder : undefined">
        <div
          ref="editor"
          class="rich-input performance-rich-text-content ace-editor zone-container editor-kit-container next-remix-rich-text-editor-textarea notranslate chrome window chrome88"
          :class="inputClass"
          :contenteditable="readonly ? 'false' : 'true'"
          data-zone-id="0"
          data-zone-container="*"
          data-slate-editor="true"
          :data-placeholder="isBlank ? placeholder : undefined"
          role="textbox"
          :aria-label="placeholder || '富文本内容'"
          aria-multiline="true"
          :aria-readonly="readonly"
          spellcheck="false"
          @compositionstart="startComposition"
          @compositionend="finishComposition"
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
import { sanitizePerformanceRichTextHtml as sanitizeHtml } from './performanceRichTextHtml'

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
let composing = false

type Position = { block: number; offset: number }
type Bookmark = { start: Position; end: Position; backward: boolean }
type InlineRun = { text: string; bold: boolean; italic: boolean; underline: boolean; href: string }
type HistoryEntry = { html: string; bookmark: Bookmark | null; marks: Record<MarkKey, boolean> }
const undoStack: HistoryEntry[] = []
const redoStack: HistoryEntry[] = []
let beforeEdit: HistoryEntry | null = null
let committed: HistoryEntry | null = null
let restoringHistory = false
let transactionOpen = false
const serializedBlocks = new WeakMap<Element, { raw: string; safe: string }>()
let selectionFrame = 0
let markOverride: string | null = null
let compositionStart: Bookmark | null = null
let compositionMarks = { bold: false, italic: false, underline: false }

function contentOf(block: HTMLElement) { return block.querySelector(':scope > ol > li, :scope > ul > li') as HTMLElement || block }
function visibleText(node: Node) { return (node.textContent || '').replace(/​/g, '') }
function positionAt(node: Node, offset: number): Position {
  const root = editor.value!
  let block = node instanceof Element ? node.closest('.ace-line') : node.parentElement?.closest('.ace-line')
  while (block?.parentElement !== root && block?.parentElement) block = block.parentElement.closest('.ace-line')
  if (!block) {
    const atEnd = offset >= root.childNodes.length
    const index = atEnd ? root.children.length - 1 : Math.min(offset, root.children.length - 1)
    return { block: index, offset: atEnd ? visibleText(root.children[index]).length : 0 }
  }
  const prefix = document.createRange()
  prefix.selectNodeContents(block)
  prefix.setEnd(node, offset)
  return { block: Array.from(root.children).indexOf(block), offset: prefix.toString().replace(/​/g, '').length }
}
function bookmark(): Bookmark | null {
  const current = document.getSelection()
  if (!editor.value || !current?.rangeCount) return null
  const range = current.getRangeAt(0)
  if (!editor.value.contains(range.startContainer) || !editor.value.contains(range.endContainer)) return null
  return { start: positionAt(range.startContainer, range.startOffset), end: positionAt(range.endContainer, range.endOffset), backward: !range.collapsed && current.anchorNode === range.endContainer && current.anchorOffset === range.endOffset }
}
function locatePosition(position: Position): [Node, number] {
  const root = editor.value!
  const block = root.children[Math.max(0, Math.min(position.block, root.children.length - 1))] as HTMLElement
  if (!block) return [root, 0]
  let remaining = position.offset
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode() as Text | null
  let last: Text | null = null
  while (node) {
    const length = visibleText(node).length
    if (length && remaining <= length) {
      let raw = 0
      let count = 0
      while (raw < node.length && count < remaining) { if (node.data[raw] !== '​') count++; raw++ }
      if (!remaining && node.data[0] === '​') raw = 1
      return [node, raw]
    }
    remaining -= length
    last = node
    node = walker.nextNode() as Text | null
  }
  return last ? [last, last.length] : [block, 0]
}
function restoreBookmark(saved: Bookmark | null) {
  if (!saved || !editor.value) return
  const range = document.createRange()
  range.setStart(...locatePosition(saved.start))
  range.setEnd(...locatePosition(saved.end))
  const current = document.getSelection()
  current?.removeAllRanges()
  current?.addRange(range)
  if (saved.backward && current?.setBaseAndExtent) current.setBaseAndExtent(range.endContainer, range.endOffset, range.startContainer, range.startOffset)
  selection.value = range.cloneRange()
}
function snapshot(): HistoryEntry { return { html: editor.value?.innerHTML || emptyHtml, bookmark: bookmark(), marks: { ...pendingMarks } } }
function beginEdit() {
  if (!restoringHistory && !beforeEdit) beforeEdit = snapshot()
}
function recordEdit() {
  if (restoringHistory || transactionOpen) return
  const previous = beforeEdit || committed
  const next = snapshot()
  if (previous && previous.html !== next.html) {
    undoStack.push(previous)
    if (undoStack.length > 100) undoStack.shift()
    redoStack.length = 0
  }
  committed = next
  beforeEdit = null
}
function history(redo = false) {
  if (props.readonly || composing) return
  const from = redo ? redoStack : undoStack
  const target = from.pop()
  if (!target || !editor.value) return
  ;(redo ? undoStack : redoStack).push(snapshot())
  restoringHistory = true
  editor.value.innerHTML = target.html
  markOverride = null
  Object.assign(pendingMarks, target.marks)
  restoreBookmark(target.bookmark)
  emitHtml()
  styleState(selection.value)
  committed = snapshot()
  beforeEdit = null
  restoringHistory = false
}
function inlineRuns(content: HTMLElement): InlineRun[] {
  const runs: InlineRun[] = []
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode() as Text | null
  while (node) {
    const text = visibleText(node)
    if (text) runs.push({ text, bold: hasMark(node, 'bold'), italic: hasMark(node, 'italic'), underline: hasMark(node, 'underline'), href: node.parentElement?.closest('a')?.getAttribute('href') || '' })
    node = walker.nextNode() as Text | null
  }
  return runs
}
function sliceRuns(runs: InlineRun[], start: number, end = Infinity) {
  let offset = 0
  return runs.flatMap(run => {
    const from = Math.max(0, start - offset)
    const to = Math.min(run.text.length, end - offset)
    offset += run.text.length
    return to > from ? [{ ...run, text: run.text.slice(from, to) }] : []
  })
}
function renderRuns(content: HTMLElement, runs: InlineRun[]) {
  const fragment = document.createDocumentFragment()
  const merged: InlineRun[] = []
  for (const run of runs) {
    if (!run.text) continue
    const previous = merged[merged.length - 1]
    if (previous && previous.bold === run.bold && previous.italic === run.italic && previous.underline === run.underline && previous.href === run.href) previous.text += run.text
    else merged.push({ ...run })
  }
  for (const run of merged) {
    const leaf = document.createElement('span')
    leaf.dataset.string = 'true'
    leaf.dataset.leaf = 'true'
    let parent: HTMLElement = leaf
    if (run.href && /^(https?:|mailto:)/i.test(run.href)) {
      const anchor = document.createElement('a')
      anchor.setAttribute('href', run.href)
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      parent.appendChild(anchor)
      parent = anchor
    }
    for (const tag of [run.bold ? 'strong' : '', run.italic ? 'em' : '', run.underline ? 'u' : ''].filter(Boolean)) {
      const wrapper = document.createElement(tag)
      parent.appendChild(wrapper)
      parent = wrapper
    }
    parent.appendChild(document.createTextNode(run.text))
    fragment.appendChild(leaf)
  }
  fragment.appendChild(emptyLeaf())
  content.replaceChildren(fragment)
}
function formatRange(saved: Bookmark, transform: (run: InlineRun) => InlineRun) {
  for (let index = saved.start.block; index <= saved.end.block; index++) {
    const block = editor.value?.children[index] as HTMLElement
    if (!block) continue
    const content = contentOf(block)
    const runs = inlineRuns(content)
    const from = index === saved.start.block ? saved.start.offset : 0
    const to = index === saved.end.block ? saved.end.offset : visibleText(content).length
    if (to <= from) continue
    renderRuns(content, [...sliceRuns(runs, 0, from), ...sliceRuns(runs, from, to).map(transform), ...sliceRuns(runs, to)])
  }
  restoreBookmark(saved)
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
  let inline = document.createElement('div')
  let listType: 'OL' | 'UL' | null = null
  let indented = false
  let trailingBreak = false
  const flush = (force = false) => {
    if (!inline.hasChildNodes() && !force && !trailingBreak) return
    trailingBreak = false
    const block = listType ? blockListWrapper(listType, inline) : plainBlock(inline)
    if (!listType && indented) block.classList.add('list-indent1')
    block.querySelectorAll<HTMLElement>('[data-enter]').forEach(leaf => { if (visibleText(leaf)) leaf.removeAttribute('data-enter') })
    blocks.push(block)
    inline = document.createElement('div')
  }
  const visit = (node: Node, wrappers: HTMLElement[] = []) => {
    if (node instanceof HTMLElement && (node.tagName === 'OL' || node.tagName === 'UL')) {
      flush()
      const previousList = listType
      const previousIndent = indented
      listType = node.tagName
      Array.from(node.children).forEach(child => visit(child, wrappers))
      flush()
      listType = previousList
      indented = previousIndent
      return
    }
    if (node instanceof HTMLElement && node.tagName === 'LI') {
      const count = blocks.length
      Array.from(node.childNodes).forEach(child => visit(child, wrappers))
      flush(blocks.length === count)
      return
    }
    if (node instanceof HTMLElement && /^(DIV|P)$/.test(node.tagName)) {
      flush()
      const previousIndent = indented
      if (node.classList.contains('list-indent1')) indented = true
      const count = blocks.length
      Array.from(node.childNodes).forEach(child => visit(child, wrappers))
      flush(blocks.length === count)
      indented = previousIndent
      return
    }
    if (node instanceof HTMLBRElement) { flush(true); trailingBreak = true; return }
    if (node instanceof HTMLElement) {
      const next = node.cloneNode(false) as HTMLElement
      if (next.hasAttribute('data-enter') && visibleText(node)) next.removeAttribute('data-enter')
      Array.from(node.childNodes).forEach(child => visit(child, [...wrappers, next]))
      return
    }
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent) return
    const parts = node.textContent.split(/\r\n|\r|\n/)
    parts.forEach((text, index) => {
      if (index) { flush(true); trailingBreak = true }
      if (!text) return
      trailingBreak = false
      let parent: HTMLElement = inline
      for (const wrapper of wrappers) {
        const next = wrapper.cloneNode(false) as HTMLElement
        parent.appendChild(next)
        parent = next
      }
      parent.appendChild(document.createTextNode(text))
    })
  }
  Array.from(root.childNodes).forEach(node => visit(node))
  flush()
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
  const textNodes = range.collapsed ? [] : selectedTextNodes(range)
  const caretText = range.collapsed && range.startContainer instanceof Text && range.startContainer.data.replace(/​/g, '').length ? range.startContainer : null
  const saved = bookmark()
  const caretKey = saved && `${saved.start.block}:${saved.start.offset}:${saved.end.block}:${saved.end.offset}`
  if (markOverride && markOverride !== caretKey) markOverride = null
  if (caretText && !markOverride) {
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
  if (!editor.value) return ''
  return Array.from(editor.value.childNodes).map(node => {
    if (!(node instanceof HTMLElement)) return sanitizeHtml(node.textContent || '')
    const raw = node.outerHTML
    const cached = serializedBlocks.get(node)
    if (cached?.raw === raw) return cached.safe
    const safe = sanitizeHtml(raw)
    serializedBlocks.set(node, { raw, safe })
    return safe
  }).join('')
}

function repairStructure() {
  const root = editor.value
  if (!root || composing) return
  const current = document.getSelection()
  const range = current?.rangeCount ? current.getRangeAt(0) : null
  const inside = range && root.contains(range.startContainer) && root.contains(range.endContainer)
  const offset = (node: Node, position: number) => {
    const prefix = document.createRange()
    prefix.selectNodeContents(root)
    prefix.setEnd(node, position)
    return prefix.toString().length
  }
  const hasText = Boolean(root.textContent?.replace(/​/g, '').length)
  const firstBlock = root.firstElementChild as HTMLElement | null
  if (!hasText && root.children.length <= 1 && !(firstBlock && (directList(firstBlock) || firstBlock.classList.contains('list-indent1')))) {
    if (root.innerHTML !== emptyHtml) {
      root.innerHTML = emptyHtml
      if (inside || document.activeElement === root) restoreBlockSelection([root.firstElementChild as HTMLElement], true)
    }
    return
  }
  const invalid = Array.from(root.childNodes).some(node => !(node instanceof HTMLElement) || !node.classList.contains('ace-line'))
  if (!invalid) return
  const start = inside ? offset(range.startContainer, range.startOffset) : null
  const end = inside ? offset(range.endContainer, range.endOffset) : null
  const fragment = document.createDocumentFragment()
  let inline = document.createDocumentFragment()
  const flush = () => {
    if (inline.childNodes.length) fragment.appendChild(plainBlock(inline))
    inline = document.createDocumentFragment()
  }
  for (const node of Array.from(root.childNodes)) {
    if (node instanceof HTMLElement && node.classList.contains('ace-line')) {
      flush()
      fragment.appendChild(node)
    } else if (node instanceof HTMLElement && /^(P|DIV)$/.test(node.tagName)) {
      flush()
      fragment.appendChild(plainBlock(node))
    } else if (node instanceof HTMLElement && /^(OL|UL)$/.test(node.tagName)) {
      flush()
      for (const item of Array.from(node.children)) fragment.appendChild(blockListWrapper(node.tagName as 'OL' | 'UL', item as HTMLElement))
    } else inline.appendChild(node)
  }
  flush()
  root.replaceChildren(fragment)
  if (start === null || end === null) return
  const locate = (position: number): [Node, number] => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      const length = node.textContent?.length || 0
      if (position <= length) return [node, position]
      position -= length
      node = walker.nextNode()
    }
    return [root, root.childNodes.length]
  }
  const restored = document.createRange()
  restored.setStart(...locate(start))
  restored.setEnd(...locate(end))
  current?.removeAllRanges()
  current?.addRange(restored)
  selection.value = restored.cloneRange()
}

function emitHtml() {
  if (!editor.value || props.readonly || composing || transactionOpen) return
  repairStructure()
  editor.value.querySelectorAll<HTMLElement>('[data-enter]').forEach(leaf => { if (visibleText(leaf)) leaf.removeAttribute('data-enter') })
  renumberOrderedLists()
  isBlank.value = editor.value.children.length <= 1 && !editor.value.textContent?.replace(/​/g, '').trim()
  const html = serializeEditor()
  recordEdit()
  if (html !== lastEmitted) {
    lastEmitted = html
    emit('update:modelValue', html)
  }
}

function startComposition() {
  beginEdit()
  compositionStart = bookmark()
  compositionMarks = { ...pendingMarks }
  composing = true
  isBlank.value = false
}
function finishComposition() {
  composing = false
  repairStructure()
  const end = bookmark()
  if (compositionStart && end && compositionStart.start.block === end.end.block && end.end.offset > compositionStart.start.offset) {
    const inserted = { start: compositionStart.start, end: end.end, backward: false }
    formatRange(inserted, run => ({ ...run, ...compositionMarks }))
    restoreBookmark(end)
  }
  compositionStart = null
  markOverride = null
  emitHtml()
  rememberSelection()
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
  const state = tag === 'strong' ? 'bold' : tag === 'em' ? 'italic' : 'underline'
  const saved = bookmark()
  if (!saved) return
  if (range.collapsed) {
    pendingMarks[state] = !pendingMarks[state]
    active[state] = pendingMarks[state]
    markOverride = `${saved.start.block}:${saved.start.offset}:${saved.end.block}:${saved.end.offset}`
    editor.value?.focus({ preventScroll: true })
    restoreBookmark(saved)
    return
  }
  beginEdit()
  const selectedRuns = Array.from(editor.value!.children).flatMap((block, index) => index < saved.start.block || index > saved.end.block ? [] : sliceRuns(inlineRuns(contentOf(block as HTMLElement)), index === saved.start.block ? saved.start.offset : 0, index === saved.end.block ? saved.end.offset : Infinity))
  const enabled = !selectedRuns.length || !selectedRuns.every(run => run[state])
  formatRange(saved, run => ({ ...run, [state]: enabled }))
  emitHtml()
  styleState(selection.value)
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
    for (const [element, attribute] of [[list, 'start'], [list, 'data-start'], [list.querySelector(':scope > li'), 'start'], [list.querySelector(':scope > li'), 'data-start']] as const) {
      if (element && element.getAttribute(attribute) !== String(start)) element.setAttribute(attribute, String(start))
    }
    if (start === 1) { if (list.getAttribute('data-origin-start') !== '1') list.setAttribute('data-origin-start', '1') }
    else if (list.hasAttribute('data-origin-start')) list.removeAttribute('data-origin-start')
  })
}

function toggleList(type: 'OL' | 'UL') {
  const range = selectedFragment()
  if (!range) return
  const blocks = selectedBlocks(range)
  if (!blocks.length) return
  const saved = bookmark()
  beginEdit()
  const removeList = blocks.every(block => directList(block)?.tagName === type)
  blocks.forEach(block => {
    const list = directList(block)
    const source = (list?.querySelector(':scope > li') as HTMLElement | null) || block
    const replacement = removeList ? plainBlock(source) : blockListWrapper(type, source)
    block.replaceWith(replacement)
  })
  renumberOrderedLists()
  restoreBookmark(saved)
  styleState(selection.value)
  emitHtml()
}

function insertPendingText(event: InputEvent) {
  if (props.readonly || composing || event.isComposing) return
  if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') { event.preventDefault(); history(event.inputType === 'historyRedo'); return }
  repairStructure()
  if (event.inputType === 'deleteContentBackward' && downgradeListAtStart()) { event.preventDefault(); return }
  if (event.inputType.startsWith('delete') && editor.value?.children.length === 1 && !visibleText(editor.value).length) { event.preventDefault(); return }
  beginEdit()
  if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') { event.preventDefault(); insertLineBreak(); return }
  if (event.inputType !== 'insertText' || !event.data) return
  const saved = bookmark()
  if (!saved) return
  event.preventDefault()
  replaceSelectionWithText(event.data, saved)
}

function replaceSelectionWithText(text: string, saved = bookmark()) {
  if (!saved || !editor.value) return
  beginEdit()
  const first = editor.value.children[saved.start.block] as HTMLElement
  const last = editor.value.children[saved.end.block] as HTMLElement
  if (!first || !last) return
  const prefix = sliceRuns(inlineRuns(contentOf(first)), 0, saved.start.offset)
  const suffix = sliceRuns(inlineRuns(contentOf(last)), saved.end.offset)
  const range = document.getSelection()?.rangeCount ? document.getSelection()!.getRangeAt(0) : null
  const element = range?.startContainer instanceof Element ? range.startContainer : range?.startContainer.parentElement
  const href = element?.closest('a')?.getAttribute('href') || ''
  renderRuns(contentOf(first), [...prefix, { text, ...pendingMarks, href }, ...suffix])
  for (let i = saved.end.block; i > saved.start.block; i--) editor.value.children[i].remove()
  const point = { block: saved.start.block, offset: saved.start.offset + text.length }
  markOverride = null
  restoreBookmark({ start: point, end: point, backward: false })
  emitHtml()
  styleState(selection.value)
}

function insertLineBreak() {
  repairStructure()
  rememberSelection()
  const range = selectedFragment()
  if (!range || !editor.value) return
  const blocks = selectedBlocks(range)
  if (!range.collapsed && blocks.length > 1) {
    const first = directList(blocks[0])?.querySelector('li') || blocks[0]
    const last = directList(blocks[blocks.length - 1])?.querySelector('li') || blocks[blocks.length - 1]
    const prefix = document.createRange()
    prefix.selectNodeContents(first)
    if (first.contains(range.startContainer)) prefix.setEnd(range.startContainer, range.startOffset)
    else prefix.collapse(true)
    const suffix = document.createRange()
    suffix.selectNodeContents(last)
    if (last.contains(range.endContainer)) suffix.setStart(range.endContainer, range.endOffset)
    else suffix.collapse(false)
    const before = prefix.cloneContents()
    const after = suffix.cloneContents()
    first.replaceChildren(before)
    range.setStart(first, first.childNodes.length)
    range.collapse(true)
    first.appendChild(after)
    for (const block of blocks.slice(1)) block.remove()
    const selected = document.getSelection()
    selected?.removeAllRanges()
    selected?.addRange(range)
    selection.value = range.cloneRange()
  } else range.deleteContents()
  repairStructure()
  rememberSelection()
  const caret = selectedFragment()
  if (!caret) return
  const current = selectedBlocks(caret)[0] || (caret.startContainer === editor.value ? editor.value.children[Math.min(caret.startOffset, editor.value.children.length - 1)] as HTMLElement : null)
  if (!current) return
  const list = directList(current)
  const source = list?.querySelector('li') || current
  const tail = document.createRange()
  tail.selectNodeContents(source)
  tail.setStart(caret.startContainer, caret.startOffset)
  const fragment = document.createElement('div')
  fragment.appendChild(tail.extractContents())
  if (!source.textContent?.replace(/​/g, '')) source.replaceChildren(emptyLeaf())
  const block = list ? blockListWrapper(list.tagName as 'OL' | 'UL', fragment) : plainBlock(fragment)
  const nextContent = list ? block.querySelector('li')! : block
  if (!nextContent.textContent?.replace(/​/g, '')) nextContent.replaceChildren(emptyLeaf())
  if (current.classList.contains('list-indent1')) block.classList.add('list-indent1')
  current.after(block)
  renumberOrderedLists()
  const next = document.createRange()
  const firstText = document.createTreeWalker(nextContent, NodeFilter.SHOW_TEXT).nextNode()
  if (firstText) next.setStart(firstText, firstText.parentElement?.hasAttribute('data-enter') ? 1 : 0)
  else next.selectNodeContents(nextContent)
  next.collapse(true)
  const selected = document.getSelection()
  selected?.removeAllRanges()
  selected?.addRange(next)
  selection.value = next.cloneRange()
  emitHtml()
}

function downgradeListAtStart() {
  const current = document.getSelection()
  if (!editor.value || !current?.rangeCount || !current.isCollapsed) return false
  const range = current.getRangeAt(0)
  if (!editor.value.contains(range.startContainer)) return false
  const block = selectedBlocks(range)[0]
  if (!block) return false
  const list = directList(block)
  const indented = block.classList.contains('list-indent1')
  if (!list && !indented) return false
  const source = list?.querySelector('li') || block
  const prefix = document.createRange()
  prefix.selectNodeContents(source)
  prefix.setEnd(range.startContainer, range.startOffset)
  if (prefix.toString().replace(/​/g, '').length) return false
  beginEdit()
  const caretNode = range.startContainer
  const caretOffset = range.startOffset
  const replacement = plainBlock(source)
  if (list?.tagName === 'OL') replacement.classList.add('list-indent1')
  block.replaceWith(replacement)
  if (replacement.contains(caretNode)) range.setStart(caretNode, caretOffset)
  else {
    const text = document.createTreeWalker(replacement, NodeFilter.SHOW_TEXT).nextNode()
    if (text) range.setStart(text, text.parentElement?.hasAttribute('data-enter') ? 1 : 0)
    else range.setStart(replacement, 0)
  }
  range.collapse(true)
  current.removeAllRanges()
  current.addRange(range)
  selection.value = range.cloneRange()
  renumberOrderedLists()
  emitHtml()
  styleState(range)
  return true
}

function keyHandler(event: KeyboardEvent) {
  if (props.readonly || composing || event.isComposing || event.keyCode === 229) return
  const modified = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()
  if (modified && (key === 'z' || key === 'y')) { event.preventDefault(); history(key === 'y' || event.shiftKey); return }
  if (modified && ['b', 'i', 'u', 'k'].includes(key)) {
    event.preventDefault()
    command(key === 'b' ? 'bold' : key === 'i' ? 'italic' : key === 'u' ? 'underline' : 'link')
    return
  }
  repairStructure()
  rememberSelection()
  if (event.key === 'Backspace' && !event.ctrlKey && !event.metaKey && !event.altKey && downgradeListAtStart()) {
    event.preventDefault()
    return
  }
  if ((event.key === 'Backspace' || event.key === 'Delete') && editor.value?.children.length === 1 && !editor.value.textContent?.replace(/​/g, '').length) {
    event.preventDefault()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    beginEdit()
    const saved = bookmark()
    const block = saved && editor.value?.children[saved.start.block] as HTMLElement | undefined
    if (block && directList(block) && !visibleText(block)) {
      const replacement = plainBlock()
      block.replaceWith(replacement)
      restoreBookmark(saved)
      emitHtml()
      styleState(selection.value)
    } else insertLineBreak()
  }
}

function applyLink() {
  const value = url.value.trim()
  const range = selectedFragment()
  if (props.readonly || !range || !value || !/^(https?:|mailto:)/i.test(value)) return
  beginEdit()
  let saved = bookmark()
  if (!saved) return
  if (range.collapsed) {
    const point = { ...saved.start }
    transactionOpen = true
    replaceSelectionWithText(value, saved)
    transactionOpen = false
    saved = { start: point, end: { ...point, offset: point.offset + value.length }, backward: false }
  }
  formatRange(saved, run => ({ ...run, href: value }))
  restoreBookmark({ start: saved.end, end: saved.end, backward: false })
  linkOpen.value = false
  url.value = ''
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
  if (props.readonly || composing || !editor.value) return
  rememberSelection()
  const saved = bookmark()
  if (!saved) return
  beginEdit()
  const html = event.clipboardData?.getData('text/html') || ''
  const source = document.createElement('div')
  source.textContent = event.clipboardData?.getData('text/plain') || ''
  const normalized = document.createElement('div')
  normalized.innerHTML = normalizeHtml(html || source.innerHTML)
  const incoming = Array.from(normalized.children) as HTMLElement[]
  const first = editor.value.children[saved.start.block] as HTMLElement
  const last = editor.value.children[saved.end.block] as HTMLElement
  const prefix = document.createRange()
  prefix.selectNodeContents(contentOf(first))
  prefix.setEnd(...locatePosition(saved.start))
  const suffix = document.createRange()
  suffix.selectNodeContents(contentOf(last))
  suffix.setStart(...locatePosition(saved.end))
  const before = prefix.cloneContents()
  const after = suffix.cloneContents()
  const lastIncomingLength = visibleText(incoming[incoming.length - 1]).length
  const replacements = incoming.map((block, index) => {
    const content = contentOf(block)
    const startFragment = index === 0 ? before : null
    const endFragment = index === incoming.length - 1 ? after : null
    if (startFragment) content.prepend(startFragment)
    if (endFragment) content.appendChild(endFragment)
    if (!directList(block) && (incoming.length === 1 || directList(first))) {
      const list = directList(first)
      return list ? blockListWrapper(list.tagName as 'OL' | 'UL', content) : plainBlock(content)
    }
    return block
  })
  for (let index = saved.end.block; index > saved.start.block; index--) editor.value.children[index].remove()
  first.replaceWith(...replacements)
  const point = { block: saved.start.block + replacements.length - 1, offset: lastIncomingLength + (replacements.length === 1 ? saved.start.offset : 0) }
  restoreBookmark({ start: point, end: point, backward: false })
  emitHtml()
  rememberSelection()
}

function syncEditor(value: string) {
  if (!editor.value || composing || value === lastEmitted || (editor.value.hasChildNodes() && value === serializeEditor())) return
  const normalized = normalizeHtml(value)
  if (editor.value.innerHTML !== normalized) editor.value.innerHTML = normalized
  isBlank.value = editor.value.children.length <= 1 && !editor.value.textContent?.replace(/​/g, '').trim()
  lastEmitted = undefined
  renumberOrderedLists()
  selection.value = null
  markOverride = null
  Object.assign(pendingMarks, { bold: false, italic: false, underline: false })
  syncStateFromContent()
  undoStack.length = 0
  redoStack.length = 0
  beforeEdit = null
  committed = snapshot()
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

function handleSelectionChange() {
  if (composing || selectionFrame || !editor.value) return
  const current = document.getSelection()
  if (!current?.anchorNode || !editor.value.contains(current.anchorNode)) return
  selectionFrame = requestAnimationFrame(() => { selectionFrame = 0; rememberSelection() })
}
onMounted(() => {
  syncEditor(props.modelValue)
  document.addEventListener('selectionchange', handleSelectionChange)
})

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', handleSelectionChange)
  if (selectionFrame) cancelAnimationFrame(selectionFrame)
})

defineExpose({ active, rememberSelection, command })
</script>

<style scoped>
.rich-editor-host :deep(.next-remix-rich-text-editor-content[data-rich-placeholder]::before){grid-area:1 / 1;align-self:start;min-width:0;max-width:100%;padding:6px 10px;box-sizing:border-box;pointer-events:none;user-select:none;white-space:pre-wrap;overflow-wrap:anywhere;color:#8f959e;content:attr(data-rich-placeholder);font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif}
.rich-editor-host--task-entry :deep(.next-remix-rich-text-editor-content[data-rich-placeholder]::before){padding:4px 11px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"}
.rich-editor-host--tag :deep(.next-remix-rich-text-editor-content[data-rich-placeholder]::before){padding:6px 8px 0 0}
.rich-editor-host{width:100%;max-width:100%;min-width:0;box-sizing:border-box}.rich-editor-host :deep(.next-remix-rich-text-editor){position:relative;width:100%;max-width:100%;min-width:0;box-sizing:border-box;background:#fff}.rich-editor-host :deep(.performance-rich-text-box__content){width:100%;max-width:100%;min-width:0;box-sizing:border-box}.rich-editor-host--tag :deep(.performance-rich-text-box__content){min-height:34px}.rich-editor-host :deep(.next-remix-rich-text-editor-content){position:relative;display:grid;grid-template-columns:minmax(0,1fr);width:100%;max-width:100%;min-width:0;min-height:90px;box-sizing:border-box;overflow:visible}.rich-editor-host :deep(.rich-input){grid-area:1 / 1;width:100%;max-width:100%;min-width:0;min-height:90px;padding:6px 10px;box-sizing:border-box;outline:0;white-space:pre-wrap;overflow-wrap:anywhere;overflow:visible;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif}.rich-editor-host :deep(.rich-input[contenteditable="true"]){cursor:text}.rich-editor-host :deep(.rich-input[contenteditable="false"]){cursor:default}.rich-editor-host--task-entry :deep(.next-remix-rich-text-editor){min-height:124px;padding-bottom:12px;color:rgba(0,0,0,.65);font:400 14px/21px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji";cursor:default}.rich-editor-host--task-entry :deep(.next-remix-rich-text-editor-content){min-height:88px}.rich-editor-host--task-entry :deep(.rich-input){min-height:88px;flex:1;padding:4px 11px;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"}.rich-editor-host--task-entry :deep(.performance-rich-toolbar){height:36px;gap:0;padding:6px 8px 6px 4px}.rich-editor-host--task-entry :deep(.performance-rich-toolbar button){margin:0 4px;border-radius:6px}.rich-editor-host--tag :deep(.performance-rich-text-box){min-height:34px;border:0;border-radius:0;box-shadow:none}.rich-editor-host--tag :deep(.next-remix-rich-text-editor){min-height:34px;border:0;border-radius:0;box-shadow:none}.rich-editor-host--tag :deep(.next-remix-rich-text-editor-content){min-height:34px}.rich-editor-host--tag :deep(.rich-input){min-height:34px;padding:6px 8px 0 0}.rich-editor-host--tag :deep(.ace-line){line-height:24px}.link-popover{position:absolute;z-index:5;top:38px;left:128px;display:flex;gap:6px;width:min(260px,calc(100% - 16px));padding:8px;box-sizing:border-box;border:1px solid #dee0e3;border-radius:6px;background:#fff;box-shadow:0 6px 24px rgba(31,35,41,.16)}.link-popover input{flex:1;min-width:0;width:100%;height:32px;padding:4px 11px;box-sizing:border-box;border:1px solid #d0d3d6;border-radius:6px;font:inherit;outline:0}.link-popover input:focus{border-color:#3370ff}.link-popover button{height:32px;padding:4px 12px;border:1px solid #3370ff;border-radius:6px;background:#3370ff;color:#fff;font:inherit;cursor:pointer}.rich-editor-host--readonly :deep(.rich-input){user-select:text}.rich-editor-host--readonly :deep(.performance-rich-toolbar){cursor:default}
</style>
