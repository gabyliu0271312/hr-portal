<template>
  <div
    ref="rootRef"
    class="performance-sortable-list"
    :class="{ 'is-dragging': draggingIndex !== null, 'is-keyboard-dragging': keyboardIndex !== null }"
    :data-impact-index="renderState.impactIndex ?? undefined"
    :data-drag-direction="renderState.dragDirection ?? undefined"
    @pointerdown.capture="handlePointerDown"
    @keydown.capture="handleKeydown"
  >
    <template v-for="(item, index) in displayItems" :key="getItemKey(item, index)">
      <div
        v-if="placeholderIndex === index"
        class="performance-sortable-list__placeholder"
        data-sortable-placeholder
        aria-hidden="true"
        :style="placeholderStyle"
      ></div>
      <slot :item="item" :index="index" :dragging="draggingIndex === index" :over="overIndex === index" :position="insertPosition" :item-style="getItemStyle(index)" />
    </template>
    <div
      v-if="placeholderIndex === displayItems.length"
      class="performance-sortable-list__placeholder"
      data-sortable-placeholder
      aria-hidden="true"
      :style="placeholderStyle"
    ></div>
    <div class="performance-sortable-list__announcement" aria-live="assertive" aria-atomic="true">{{ announcement }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue'

interface RectSnapshot {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
  centerX: number
  centerY: number
}

interface ScrollSnapshot {
  element: HTMLElement
  left: number
  top: number
}

const props = defineProps<{
  items: object[]
  itemKey: string | ((item: object, index: number) => string)
  disabled?: boolean
  gap?: number | 'auto'
}>()

const emit = defineEmits<{
  reorder: [from: number, to: number]
  'drag-start': [index: number]
  'drag-end': [from: number, to: number]
  'drag-cancel': [index: number]
}>()

defineSlots<{
  default(props: { item: any; index: number; dragging: boolean; over: boolean; position: 'before' | 'after' | null; itemStyle: Record<string, string> }): any
}>()

const rootRef = ref<HTMLElement | null>(null)
const draggingIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)
const insertPosition = ref<'before' | 'after' | null>(null)
const keyboardIndex = ref<number | null>(null)
const keyboardOriginIndex = ref<number | null>(null)
const keyboardItemKey = ref<string | null>(null)
const keyboardItems = ref<object[]>([])
const announcement = ref('')
const activeHandle = ref<HTMLElement | null>(null)
const dragMetrics = reactive({ top: 0, left: 0, width: 0, height: 0, marginBottom: 0, offsetX: 0, offsetY: 0 })
const pointer = reactive({ id: null as number | null, from: null as number | null, startX: 0, startY: 0, currentX: 0, currentY: 0 })
const dragDimensions = new Map<number, RectSnapshot>()
const scrollSnapshots: ScrollSnapshot[] = []
const scrollOrigin = reactive({ x: 0, y: 0 })
const motionItemIds = reactive(new Set<string>())
let visualFrame: number | null = null

const renderState = reactive({
  phase: 'idle' as 'idle' | 'lifting' | 'dragging',
  sourceId: null as string | null,
  sourceIndex: null as number | null,
  activeRect: null as RectSnapshot | null,
  placeholderRect: null as RectSnapshot | null,
  itemRects: {} as Record<string, RectSnapshot>,
  dragDirection: null as 'up' | 'down' | null,
  impactIndex: null as number | null,
  insertPosition: null as 'before' | 'after' | null,
  displacedItemIds: [] as string[],
  displacementByItem: {} as Record<string, number>,
  flowCompensationByItem: {} as Record<string, number>,
  impactDisplacementByItem: {} as Record<string, number>,
  targetDisplacementByItem: {} as Record<string, number>,
  placeholderIndex: null as number | null,
})

const displayItems = computed(() => keyboardIndex.value === null ? props.items : keyboardItems.value)
const placeholderIndex = computed(() => draggingIndex.value === null ? null : renderState.placeholderIndex)
const placeholderStyle = computed(() => ({
  width: dragMetrics.width ? `${dragMetrics.width}px` : '100%',
  height: dragMetrics.height ? `${dragMetrics.height}px` : '0px',
  marginBottom: `${dragMetrics.marginBottom}px`,
}))

function getItemKey(item: object, index: number) {
  const value = typeof props.itemKey === 'function' ? props.itemKey(item, index) : (item as Record<string, unknown>)[props.itemKey]
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error('PerformanceSortableList requires a stable itemKey for every item')
  }
  return String(value)
}

function toRect(rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>): RectSnapshot {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
    centerX: rect.left + rect.width / 2,
    centerY: rect.top + rect.height / 2,
  }
}

function translatedRect(rect: RectSnapshot, offsetX: number, offsetY: number): RectSnapshot {
  return {
    left: rect.left + offsetX,
    top: rect.top + offsetY,
    right: rect.right + offsetX,
    bottom: rect.bottom + offsetY,
    width: rect.width,
    height: rect.height,
    centerX: rect.centerX + offsetX,
    centerY: rect.centerY + offsetY,
  }
}

function rowFromTarget(target: EventTarget | null) {
  const element = target as Element | null
  if (!element || typeof element.closest !== 'function') return null
  return element.closest<HTMLElement>('[data-sortable-index]')
}

function handleFromTarget(target: EventTarget | null) {
  const element = target as Element | null
  if (!element || typeof element.closest !== 'function') return null
  return element.closest<HTMLElement>('[data-drag-handle]')
}

function indexFromRow(row: HTMLElement | null) {
  const value = row?.dataset.sortableIndex
  return value === undefined ? null : Number(value)
}

function rows() {
  return rootRef.value ? Array.from(rootRef.value.querySelectorAll<HTMLElement>('[data-sortable-index]')) : []
}

function captureScrollSnapshots(row: HTMLElement) {
  scrollSnapshots.length = 0
  let parent = row.parentElement
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const style = getComputedStyle(parent)
    if (/(auto|scroll)/.test(`${style.overflow}${style.overflowX}${style.overflowY}`)) {
      scrollSnapshots.push({ element: parent, left: parent.scrollLeft, top: parent.scrollTop })
    }
    parent = parent.parentElement
  }
  scrollOrigin.x = window.scrollX
  scrollOrigin.y = window.scrollY
}

function scrollDelta() {
  return scrollSnapshots.reduce((delta, snapshot) => ({
    x: delta.x + snapshot.element.scrollLeft - snapshot.left,
    y: delta.y + snapshot.element.scrollTop - snapshot.top,
  }), { x: window.scrollX - scrollOrigin.x, y: window.scrollY - scrollOrigin.y })
}

function currentDragDimensions() {
  const delta = scrollDelta()
  return new Map(Array.from(dragDimensions.entries()).map(([index, rect]) => [index, translatedRect(rect, -delta.x, -delta.y)]))
}

function activeRect() {
  return toRect({
    left: dragMetrics.left + dragMetrics.offsetX,
    top: dragMetrics.top + dragMetrics.offsetY,
    right: dragMetrics.left + dragMetrics.offsetX + dragMetrics.width,
    bottom: dragMetrics.top + dragMetrics.offsetY + dragMetrics.height,
    width: dragMetrics.width,
    height: dragMetrics.height,
  })
}

function isInsideList(clientX: number, clientY: number, dimensions: Map<number, RectSnapshot>) {
  const ordered = Array.from(dimensions.values())
  if (!ordered.length) return false
  const left = Math.min(...ordered.map((rect) => rect.left))
  const right = Math.max(...ordered.map((rect) => rect.right))
  const top = Math.min(...ordered.map((rect) => rect.top))
  const bottom = Math.max(...ordered.map((rect) => rect.bottom))
  return clientX >= left && clientX <= right && clientY >= top && clientY <= bottom
}

function resolveGap(index: number, dimensions: Map<number, RectSnapshot>) {
  if (props.gap !== undefined && props.gap !== 'auto') return Math.max(0, props.gap)
  const current = dimensions.get(index)
  const next = dimensions.get(index + 1)
  if (current && next) return Math.max(0, next.top - current.bottom)
  const previous = dimensions.get(index - 1)
  if (current && previous) return Math.max(0, current.top - previous.bottom)
  return 0
}

function displacementState(sourceIndex: number, targetIndex: number, direction: 'up' | 'down', distance: number) {
  const flowCompensationByItem: Record<string, number> = {}
  const impactDisplacementByItem: Record<string, number> = {}
  const targetDisplacementByItem: Record<string, number> = {}

  displayItems.value.forEach((item, index) => {
    if (index === sourceIndex) return
    const key = getItemKey(item, index)
    if (direction === 'down' && index > sourceIndex && index <= targetIndex) impactDisplacementByItem[key] = -distance
    if (direction === 'up' && index >= targetIndex && index < sourceIndex) impactDisplacementByItem[key] = distance
    const displacement = impactDisplacementByItem[key] || 0
    if (displacement) targetDisplacementByItem[key] = displacement
  })

  return { flowCompensationByItem, impactDisplacementByItem, targetDisplacementByItem }
}

function applyDisplacementState(next: ReturnType<typeof displacementState>) {
  const previous = renderState.targetDisplacementByItem
  const keys = new Set([...Object.keys(previous), ...Object.keys(next.targetDisplacementByItem)])
  keys.forEach((key) => {
    if ((previous[key] || 0) !== (next.targetDisplacementByItem[key] || 0)) motionItemIds.add(key)
  })
  renderState.flowCompensationByItem = next.flowCompensationByItem
  renderState.impactDisplacementByItem = next.impactDisplacementByItem
  renderState.targetDisplacementByItem = next.targetDisplacementByItem
  renderState.displacedItemIds = Object.keys(next.targetDisplacementByItem)
}

function updateRenderState(clientX: number, clientY: number) {
  const sourceIndex = pointer.from
  if (sourceIndex === null) return
  const dimensions = currentDragDimensions()
  const sourceRect = dimensions.get(sourceIndex)
  if (!sourceRect) return

  const currentActiveRect = activeRect()
  renderState.activeRect = currentActiveRect
  renderState.itemRects = Object.fromEntries(Array.from(dimensions.entries()).map(([index, rect]) => [getItemKey(displayItems.value[index], index), rect]))

  if (!isInsideList(clientX, clientY, dimensions)) {
    overIndex.value = null
    insertPosition.value = null
    renderState.impactIndex = null
    renderState.insertPosition = null
    return
  }

  const direction = currentActiveRect.top < sourceRect.top ? 'up' : 'down'
  let targetIndex = sourceIndex
  if (direction === 'down') {
    for (let index = sourceIndex + 1; index < displayItems.value.length; index += 1) {
      const candidate = dimensions.get(index)
      if (candidate && currentActiveRect.bottom >= candidate.centerY) targetIndex = index
    }
  } else {
    for (let index = sourceIndex - 1; index >= 0; index -= 1) {
      const candidate = dimensions.get(index)
      if (candidate && currentActiveRect.top <= candidate.centerY) targetIndex = index
    }
  }

  const position = direction === 'down' ? 'after' : 'before'
  overIndex.value = targetIndex
  insertPosition.value = position
  renderState.dragDirection = direction
  renderState.impactIndex = targetIndex
  renderState.insertPosition = position
  renderState.placeholderIndex = sourceIndex
  applyDisplacementState(displacementState(sourceIndex, targetIndex, direction, dragMetrics.height + dragMetrics.marginBottom))
}

function initializeLiftState(direction: 'up' | 'down') {
  const sourceIndex = pointer.from
  if (sourceIndex === null) return
  overIndex.value = sourceIndex
  insertPosition.value = direction === 'down' ? 'after' : 'before'
  renderState.dragDirection = direction
  renderState.impactIndex = sourceIndex
  renderState.insertPosition = insertPosition.value
  renderState.placeholderIndex = sourceIndex
  renderState.activeRect = activeRect()
  applyDisplacementState(displacementState(sourceIndex, sourceIndex, direction, dragMetrics.height + dragMetrics.marginBottom))
}

function finishLiftFrame() {
  void nextTick(() => {
    rootRef.value?.getBoundingClientRect()
    requestAnimationFrame(() => {
      if (renderState.phase !== 'lifting' || draggingIndex.value === null) return
      renderState.phase = 'dragging'
      updateRenderState(pointer.currentX, pointer.currentY)
    })
  })
}

function readTranslateY(row: HTMLElement) {
  const transform = getComputedStyle(row).transform || row.style.transform
  if (!transform || transform === 'none') return 0
  const matrix3d = transform.match(/^matrix3d\((.+)\)$/)
  if (matrix3d) return Number(matrix3d[1].split(',')[13]) || 0
  const matrix = transform.match(/^matrix\((.+)\)$/)
  if (matrix) return Number(matrix[1].split(',')[5]) || 0
  const translate = transform.match(/translate(?:3d)?\([^,]+,\s*(-?[\d.]+)px/)
  return translate ? Number(translate[1]) : 0
}

function captureVisualState() {
  visualFrame = null
  const sourceIndex = draggingIndex.value
  if (sourceIndex === null) return

  const itemRects: Record<string, RectSnapshot> = {}
  const displacementByItem: Record<string, number> = {}
  rows().forEach((row) => {
    const index = indexFromRow(row)
    if (index === null) return
    const key = getItemKey(displayItems.value[index], index)
    itemRects[key] = index === sourceIndex && renderState.activeRect ? renderState.activeRect : toRect(row.getBoundingClientRect())
    if (index !== sourceIndex) displacementByItem[key] = readTranslateY(row)
  })
  renderState.itemRects = itemRects
  renderState.displacementByItem = displacementByItem

  const placeholder = rootRef.value?.querySelector<HTMLElement>('[data-sortable-placeholder]')
  renderState.placeholderRect = placeholder ? toRect(placeholder.getBoundingClientRect()) : null

  for (const key of motionItemIds) {
    if (Math.abs((displacementByItem[key] || 0) - (renderState.targetDisplacementByItem[key] || 0)) < 0.1) motionItemIds.delete(key)
  }
  visualFrame = requestAnimationFrame(captureVisualState)
}

function startVisualFrames() {
  if (visualFrame === null) visualFrame = requestAnimationFrame(captureVisualState)
}

function stopVisualFrames() {
  if (visualFrame !== null) cancelAnimationFrame(visualFrame)
  visualFrame = null
}

function handlePointerDown(event: PointerEvent) {
  if (props.disabled || (event.button !== undefined && event.button !== 0) || pointer.id !== null || keyboardIndex.value !== null) return
  const handle = handleFromTarget(event.target)
  const row = rowFromTarget(event.target)
  const index = indexFromRow(row)
  if (!handle || !row || index === null || handle.getAttribute('aria-disabled') === 'true') return
  const rect = row.getBoundingClientRect()

  const dimensions = new Map<number, RectSnapshot>()
  rows().forEach((itemRow) => {
    const itemIndex = indexFromRow(itemRow)
    if (itemIndex !== null) dimensions.set(itemIndex, toRect(itemRow.getBoundingClientRect()))
  })
  dragDimensions.clear()
  dimensions.forEach((rect, itemIndex) => dragDimensions.set(itemIndex, rect))
  captureScrollSnapshots(row)
  pointer.id = event.pointerId
  pointer.from = index
  pointer.startX = event.clientX
  pointer.startY = event.clientY
  pointer.currentX = event.clientX
  pointer.currentY = event.clientY
  activeHandle.value = handle
  Object.assign(dragMetrics, {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    marginBottom: resolveGap(index, dimensions),
    offsetX: 0,
    offsetY: 0,
  })
  handle.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', handlePointerMove, { passive: false })
  window.addEventListener('pointerup', handlePointerUp)
  window.addEventListener('pointercancel', handlePointerCancel)
  window.addEventListener('scroll', handleScroll, true)
}

function handlePointerMove(event: PointerEvent) {
  if (pointer.id !== event.pointerId || pointer.from === null) return
  const offsetX = event.clientX - pointer.startX
  const offsetY = event.clientY - pointer.startY
  let justLifted = false
  pointer.currentX = event.clientX
  pointer.currentY = event.clientY
  if (draggingIndex.value === null) {
    if (Math.hypot(offsetX, offsetY) < 4) return
    draggingIndex.value = pointer.from
    renderState.phase = 'lifting'
    renderState.sourceIndex = pointer.from
    renderState.sourceId = getItemKey(displayItems.value[pointer.from], pointer.from)
    renderState.placeholderIndex = pointer.from
    emit('drag-start', pointer.from)
    announce(`You have lifted an item in position ${pointer.from + 1}`)
    document.body.classList.add('performance-sortable-list-dragging')
    startVisualFrames()
    justLifted = true
  }
  event.preventDefault()
  dragMetrics.offsetX = offsetX
  dragMetrics.offsetY = offsetY
  if (justLifted) {
    initializeLiftState(offsetY < 0 ? 'up' : 'down')
    finishLiftFrame()
    return
  }
  updateRenderState(event.clientX, event.clientY)
}

function handleScroll() {
  if (draggingIndex.value === null) return
  updateRenderState(pointer.currentX, pointer.currentY)
}

function getItemStyle(index: number): Record<string, string> {
  const from = draggingIndex.value
  if (from === null) return {}
  if (from === index) {
    return {
      position: 'fixed',
      top: `${dragMetrics.top}px`,
      left: `${dragMetrics.left}px`,
      width: `${dragMetrics.width}px`,
      height: `${dragMetrics.height}px`,
      marginBottom: `${dragMetrics.marginBottom}px`,
      boxSizing: 'border-box',
      zIndex: '5000',
      pointerEvents: 'none',
      transform: `translate(${dragMetrics.offsetX}px, ${dragMetrics.offsetY}px)`,
      transition: 'none',
    }
  }
  const key = getItemKey(displayItems.value[index], index)
  const displacement = renderState.targetDisplacementByItem[key] || 0
  if (!displacement && !motionItemIds.has(key)) return {}
  return {
    transform: displacement ? `translate(0, ${displacement}px)` : 'none',
    transition: renderState.phase === 'lifting' ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)',
  }
}

function handlePointerUp(event: PointerEvent) {
  if (pointer.id !== event.pointerId) return
  const from = pointer.from
  const wasDragging = draggingIndex.value !== null
  if (wasDragging && from !== null) {
    pointer.currentX = event.clientX
    pointer.currentY = event.clientY
    dragMetrics.offsetX = event.clientX - pointer.startX
    dragMetrics.offsetY = event.clientY - pointer.startY
    updateRenderState(event.clientX, event.clientY)
  }
  const to = renderState.impactIndex
  clearPointer()
  if (from === null) return
  if (!wasDragging || to === null || to === from) {
    emit('drag-cancel', from)
    announce(`You have cancelled dragging item in position ${from + 1}`)
    restoreFocus()
    return
  }
  emit('reorder', from, to)
  emit('drag-end', from, to)
  announce(`You have dropped the item. You have moved the item from position ${from + 1} to position ${to + 1}`)
  restoreFocus()
}

function handlePointerCancel(event: PointerEvent) {
  if (pointer.id !== event.pointerId) return
  const from = pointer.from
  clearPointer()
  if (from !== null) {
    emit('drag-cancel', from)
    announce(`You have cancelled dragging item in position ${from + 1}`)
    restoreFocus()
  }
}

function clearPointer() {
  if (pointer.id !== null) activeHandle.value?.releasePointerCapture?.(pointer.id)
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
  window.removeEventListener('pointercancel', handlePointerCancel)
  window.removeEventListener('scroll', handleScroll, true)
  stopVisualFrames()
  pointer.id = null
  pointer.from = null
  pointer.currentX = 0
  pointer.currentY = 0
  dragDimensions.clear()
  scrollSnapshots.length = 0
  motionItemIds.clear()
  draggingIndex.value = null
  overIndex.value = null
  insertPosition.value = null
  document.body.classList.remove('performance-sortable-list-dragging')
  Object.assign(dragMetrics, { top: 0, left: 0, width: 0, height: 0, marginBottom: 0, offsetX: 0, offsetY: 0 })
  Object.assign(renderState, {
    phase: 'idle',
    sourceId: null,
    sourceIndex: null,
    activeRect: null,
    placeholderRect: null,
    itemRects: {},
    dragDirection: null,
    impactIndex: null,
    insertPosition: null,
    displacedItemIds: [],
    displacementByItem: {},
    flowCompensationByItem: {},
    impactDisplacementByItem: {},
    targetDisplacementByItem: {},
    placeholderIndex: null,
  })
}

function handleKeydown(event: KeyboardEvent) {
  const handle = handleFromTarget(event.target)
  const row = rowFromTarget(event.target)
  const index = indexFromRow(row)
  if (!handle || index === null || props.disabled || handle.getAttribute('aria-disabled') === 'true') return

  const isCommitKey = event.key === ' ' || event.key === 'Enter'
  if (keyboardIndex.value === null) {
    if (!isCommitKey) return
    event.preventDefault()
    const initialItems = displayItems.value.slice()
    keyboardIndex.value = index
    keyboardOriginIndex.value = index
    keyboardItems.value = initialItems
    keyboardItemKey.value = getItemKey(initialItems[index], index)
    announce(`You have lifted an item in position ${index + 1}`)
    emit('drag-start', index)
    return
  }

  if (isCommitKey) {
    event.preventDefault()
    commitKeyboardDrag()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelKeyboardDrag()
    return
  }
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return

  event.preventDefault()
  const current = keyboardIndex.value
  const target = current + (event.key === 'ArrowUp' ? -1 : 1)
  if (target < 0 || target >= keyboardItems.value.length) return
  const next = keyboardItems.value.slice()
  ;[next[current], next[target]] = [next[target], next[current]]
  keyboardItems.value = next
  keyboardIndex.value = target
  announce(`You have moved the item to position ${target + 1}`)
  void nextTick(() => focusKeyboardItem(target))
}

function commitKeyboardDrag() {
  const from = keyboardOriginIndex.value
  const key = keyboardItemKey.value
  const to = key === null ? keyboardIndex.value : keyboardItems.value.findIndex((item, index) => getItemKey(item, index) === key)
  if (from !== null && to !== null && to >= 0 && from !== to) {
    emit('reorder', from, to)
    emit('drag-end', from, to)
    announce(`You have dropped the item. You have moved the item from position ${from + 1} to position ${to + 1}`)
  } else if (from !== null) {
    emit('drag-cancel', from)
    announce(`You have cancelled dragging item in position ${from + 1}`)
  }
  const focusIndex = to === null || to < 0 ? from : to
  resetKeyboard()
  void nextTick(() => focusKeyboardItem(focusIndex))
}

function cancelKeyboardDrag() {
  const from = keyboardOriginIndex.value
  resetKeyboard()
  if (from !== null) {
    emit('drag-cancel', from)
    announce(`You have cancelled dragging item in position ${from + 1}`)
    void nextTick(() => focusKeyboardItem(from))
  }
}

function resetKeyboard() {
  keyboardIndex.value = null
  keyboardOriginIndex.value = null
  keyboardItemKey.value = null
  keyboardItems.value = []
}

function focusKeyboardItem(index: number | null) {
  if (index === null || index < 0) return
  rows()[index]?.querySelector<HTMLElement>('[data-drag-handle]')?.focus()
}

function restoreFocus() {
  const handle = activeHandle.value
  void nextTick(() => handle?.focus())
  activeHandle.value = null
}

function announce(message: string) {
  announcement.value = message
}

defineExpose({ renderState, startPointerDrag: handlePointerDown })

onBeforeUnmount(() => {
  clearPointer()
  resetKeyboard()
})
</script>

<style scoped>
.performance-sortable-list { position: relative; }
.performance-sortable-list__placeholder { display: flex; box-sizing: border-box; margin: 0; flex: 0 0 auto; visibility: hidden; border: 0; background: transparent; pointer-events: none; }
.performance-sortable-list__announcement { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
:global(body.performance-sortable-list-dragging) { cursor: grabbing; user-select: none; overflow-anchor: none; }
</style>
