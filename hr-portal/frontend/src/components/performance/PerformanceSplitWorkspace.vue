<template>
  <div ref="container" class="performance-split-workspace" :class="{ 'is-split': splitActive, 'is-dragging': dragging }" :style="{ '--split-left-width': `${leftWidth}px` }">
    <section v-show="splitActive" class="split-reference-pane" aria-label="参考内容"><slot name="left" /></section>
    <button v-show="splitActive" class="split-separator" type="button" role="separator" aria-orientation="vertical" aria-label="调整参考区与填写区宽度" :aria-valuemin="MIN_WIDTH" :aria-valuemax="Math.max(MIN_WIDTH, width - RESERVED_WIDTH - MIN_WIDTH)" :aria-valuenow="Math.round(leftWidth)" @keydown="onKeydown" @mousedown="startDrag">
      <svg class="split-grip" width="4" height="20" fill="none" aria-hidden="true"><rect width="4" height="4" rx="2" fill="currentColor" /><rect y="8" width="4" height="4" rx="2" fill="currentColor" /><rect y="16" width="4" height="4" rx="2" fill="currentColor" /></svg>
    </button>
    <section class="split-current-pane" aria-label="当前任务">
      <div v-show="!splitActive" class="split-single-tabs"><slot name="tabs" /></div>
      <main class="summary-scroll"><slot /></main>
      <slot name="footer" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { PERFORMANCE_SPLIT_MIN_WIDTH, readPerformanceSplitOffset, savePerformanceSplitOffset } from '@/composables/usePerformanceWriteMode'

const MIN_WIDTH = 524
const RESERVED_WIDTH = 13
const props = defineProps<{ enabled: boolean }>()
const emit = defineEmits<{ available: [value: boolean] }>()
const container = ref<HTMLElement | null>(null)
const width = ref(0)
const offset = ref(readPerformanceSplitOffset())
const dragging = ref(false)
const splitActive = computed(() => props.enabled && width.value >= PERFORMANCE_SPLIT_MIN_WIDTH)
const leftWidth = computed(() => Math.max(0, width.value * .6 + offset.value))
let observer: ResizeObserver | undefined
let timer: number | undefined
let pendingX: number | undefined
let startX = 0
let startOffset = 0
let previousUserSelect = ''
let lastMoveAt = 0
function clamp(value: number) { const base = width.value * .6; return Math.min(width.value - RESERVED_WIDTH - MIN_WIDTH - base, Math.max(MIN_WIDTH - base, value)) }
function flushMove() {
  if (dragging.value && pendingX !== undefined) offset.value = clamp(startOffset + pendingX - startX)
  pendingX = undefined
  timer = undefined
  lastMoveAt = performance.now()
}
function onMove(event: MouseEvent) {
  if (!dragging.value) return
  pendingX = event.pageX
  const elapsed = performance.now() - lastMoveAt
  if (elapsed >= 33) { if (timer !== undefined) window.clearTimeout(timer); flushMove() }
  else if (timer === undefined) timer = window.setTimeout(flushMove, 33 - elapsed)
}
function stopDrag() {
  if (!dragging.value) return
  if (timer !== undefined) window.clearTimeout(timer)
  flushMove()
  dragging.value = false
  document.body.style.userSelect = previousUserSelect
  savePerformanceSplitOffset(offset.value)
  document.body.removeEventListener('mousemove', onMove)
  document.body.removeEventListener('mouseup', stopDrag)
  window.removeEventListener('blur', stopDrag)
}
function startDrag(event: MouseEvent) {
  if (!splitActive.value || event.button !== 0 || dragging.value) return
  event.preventDefault()
  startX = event.pageX
  startOffset = offset.value
  lastMoveAt = -Infinity
  previousUserSelect = document.body.style.userSelect
  dragging.value = true
  document.body.style.userSelect = 'none'
  document.body.addEventListener('mousemove', onMove)
  document.body.addEventListener('mouseup', stopDrag)
  window.addEventListener('blur', stopDrag)
}
function onKeydown(event: KeyboardEvent) {
  if (!splitActive.value || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  offset.value = clamp(event.key === 'Home' ? -Infinity : event.key === 'End' ? Infinity : offset.value + (event.key === 'ArrowRight' ? 16 : -16))
  savePerformanceSplitOffset(offset.value)
}
function measure() {
  const nextWidth = container.value?.getBoundingClientRect().width || 0
  if (nextWidth !== width.value) stopDrag()
  width.value = nextWidth
  if (width.value >= PERFORMANCE_SPLIT_MIN_WIDTH) offset.value = clamp(offset.value)
  emit('available', width.value >= PERFORMANCE_SPLIT_MIN_WIDTH)
}
watch(() => props.enabled, () => { stopDrag(); measure() })
onMounted(() => {
  measure()
  if (container.value && typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(measure); observer.observe(container.value) }
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => { stopDrag(); observer?.disconnect(); window.removeEventListener('resize', measure) })
</script>

<style scoped>
.performance-split-workspace{display:flex;width:100%;height:100%;flex:1;min-width:0;min-height:0;overflow:hidden}
.split-reference-pane{flex:0 0 var(--split-left-width);width:var(--split-left-width);min-width:0;min-height:0;overflow:hidden;display:flex;flex-direction:column;padding:12px 0 12px 12px}
.split-current-pane{display:flex;flex:1;min-width:0;min-height:0;flex-direction:column;overflow:hidden}
.split-single-tabs{flex:none;min-width:0}
.summary-scroll{display:flex;flex:1;min-width:0;min-height:0;flex-direction:column;overflow:auto;padding:12px}
.summary-scroll :slotted(*){flex:1 0 auto;min-width:0}
.split-separator{display:flex;flex:0 0 6px;width:6px;min-width:6px;height:100%;align-items:center;justify-content:center;padding:0;border:0;background:#f5f6f7;cursor:col-resize;user-select:none;color:#8f959e;transform:translateX(6px)}
.split-separator:hover,.split-separator:active,.is-dragging .split-separator{background:rgba(186,206,253,.7);color:var(--color-primary)}
.split-separator:focus-visible{outline:2px solid var(--color-primary);outline-offset:-2px}
.split-grip{width:4px;height:20px;flex:none}
@media(max-width:640px){.summary-scroll{padding:12px 16px}}
</style>
