<template>
  <Teleport to="body">
    <div v-if="visible && anchor" v-bind="$attrs" ref="popover" class="performance-popover" :class="[name, `${name}--${placement}`]" :data-placement="placement" :style="position" :role="role" @mouseenter="$emit('mouseenter')" @mouseleave="$emit('mouseleave')">
      <div class="performance-popover__content" :class="contentClass"><slot /></div>
      <div v-if="showArrow" class="performance-popover__arrow" :class="[arrowClass, `performance-popover__arrow--${placement}`]" :style="horizontal ? { top: `${arrowLeft}px` } : { left: `${arrowLeft}px` }" aria-hidden="true">
        <svg v-if="horizontal" width="8" height="16" viewBox="0 0 8 16" fill="none"><path d="M-.5 8v8h1c0-1.553.664-3.033 1.825-4.065l3.166-2.814a1.5 1.5 0 000-2.242L2.325 4.065A5.438 5.438 0 01.5 0h-1v8z" /></svg>
        <svg v-else width="16" height="8" viewBox="0 0 16 8" fill="none"><path d="M8-.5H0v1c1.553 0 3.033.664 4.065 1.825l2.814 3.166a1.5 1.5 0 002.242 0l2.814-3.166A5.438 5.438 0 0116 .5v-1H8z" /></svg>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{
  visible: boolean
  role?: 'tooltip' | 'dialog'
  anchor: HTMLElement | DOMRect | null
  width?: number | string
  maxWidth?: number | string
  gap?: number | string
  viewportMargin?: number
  name?: string
  contentClass?: string
  arrowClass?: string
  align?: 'center' | 'end'
  side?: 'auto' | 'bottom' | 'right'
  showArrow?: boolean
}>(), { name: 'performance-popover', role: 'tooltip', align: 'center', side: 'auto', showArrow: true })
const emit = defineEmits<{ close: []; mouseenter: []; mouseleave: [] }>()
const popover = ref<HTMLElement | null>(null)
const placement = ref<'top' | 'bottom' | 'right' | 'left'>('top')
const horizontal = computed(() => placement.value === 'right' || placement.value === 'left')
const position = ref<CSSProperties>({ visibility: 'hidden' })
const arrowLeft = ref(0)
let observer: ResizeObserver | undefined

function token(name: string, fallback: number) {
  const value = parseFloat(getComputedStyle(popover.value!).getPropertyValue(name))
  return Number.isFinite(value) ? value : fallback
}
function updatePosition() {
  const panel = popover.value
  if (!props.visible || !props.anchor || !panel) return
  const rect = props.anchor instanceof HTMLElement ? props.anchor.getBoundingClientRect() : props.anchor
  if (props.anchor instanceof HTMLElement && !props.anchor.isConnected) { emit('close'); return }
  const margin = props.viewportMargin ?? token('--performance-popover-viewport-margin', 16)
  const gap = typeof props.gap === 'string' ? token(props.gap.replace(/^var\((.*)\)$/, '$1'), 10) : props.gap ?? token('--performance-popover-gap', 10)
  const width = props.width === 'auto' ? 'max-content' : typeof props.width === 'string' ? props.width : `${props.width ?? token('--performance-popover-width', 420)}px`
  panel.style.width = width
  const viewportMaxWidth = `${Math.max(0, window.innerWidth - margin * 2)}px`
  const configuredMaxWidth = typeof props.maxWidth === 'number' ? `${props.maxWidth}px` : props.maxWidth
  const maxWidth = configuredMaxWidth ? `min(${configuredMaxWidth}, ${viewportMaxWidth})` : viewportMaxWidth
  panel.style.maxWidth = maxWidth
  const content = panel.querySelector<HTMLElement>('.performance-popover__content')!
  if (props.side === 'right') {
    const rightSpace = Math.max(0, window.innerWidth - rect.right - gap - margin)
    const leftSpace = Math.max(0, rect.left - gap - margin)
    const right = rightSpace >= panel.getBoundingClientRect().width || rightSpace >= leftSpace
    placement.value = right ? 'right' : 'left'
    const sideMaxWidth = `min(${maxWidth}, ${right ? rightSpace : leftSpace}px)`
    panel.style.maxWidth = sideMaxWidth
    content.style.maxHeight = `${Math.max(0, window.innerHeight - margin * 2)}px`
    const size = panel.getBoundingClientRect()
    const center = rect.top + rect.height / 2
    const top = Math.max(margin, Math.min(center - size.height / 2, window.innerHeight - size.height - margin))
    position.value = { width, maxWidth: sideMaxWidth, left: `${right ? rect.right + gap : Math.max(margin, rect.left - gap - size.width)}px`, top: `${top}px`, visibility: 'visible' }
    const inset = token('--performance-popover-arrow-inset', 16)
    arrowLeft.value = Math.max(Math.min(inset, size.height / 2), Math.min(center - top, size.height - inset))
    return
  }
  const above = Math.max(0, rect.top - gap - margin)
  const below = Math.max(0, window.innerHeight - rect.bottom - gap - margin)
  const naturalHeight = Math.max(content.scrollHeight, panel.getBoundingClientRect().height)
  const top = props.side !== 'bottom' && (above >= naturalHeight || above >= below)
  placement.value = top ? 'top' : 'bottom'
  content.style.maxHeight = `${top ? above : below}px`
  const size = panel.getBoundingClientRect()
  const center = rect.left + rect.width / 2
  const preferredLeft = props.align === 'end' ? rect.right - size.width : center - size.width / 2
  const left = Math.max(margin, Math.min(preferredLeft, window.innerWidth - size.width - margin))
  position.value = { width, maxWidth, left: `${left}px`, top: `${Math.max(margin, top ? rect.top - size.height - gap : rect.bottom + gap)}px`, visibility: 'visible' }
  const inset = token('--performance-popover-arrow-inset', 16)
  arrowLeft.value = Math.max(Math.min(inset, size.width / 2), Math.min(center - left, size.width - inset))
}
function onKeydown(event: KeyboardEvent) { if (event.key === 'Escape') emit('close') }
function cleanup() {
  observer?.disconnect()
  observer = undefined
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
  window.removeEventListener('keydown', onKeydown)
}
watch(() => [props.visible, props.anchor, props.width, props.maxWidth, props.gap, props.viewportMargin, props.align, props.side], () => {
  cleanup()
  if (!props.visible || !props.anchor) return
  position.value = { visibility: 'hidden' }
  updatePosition()
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)
  window.addEventListener('keydown', onKeydown)
  if (typeof ResizeObserver !== 'undefined' && popover.value) {
    observer = new ResizeObserver(updatePosition)
    observer.observe(popover.value)
    if (props.anchor instanceof HTMLElement) observer.observe(props.anchor)
  }
}, { immediate: true, flush: 'post' })
onMounted(() => { if (props.visible && props.anchor) updatePosition() })
onBeforeUnmount(cleanup)
</script>

<style scoped>
.performance-popover{position:fixed;z-index:var(--performance-popover-z-index);box-sizing:border-box;min-width:var(--performance-popover-min-width);color:var(--color-text-primary);font:400 var(--font-size-md)/var(--performance-popover-line-height) var(--font-sans);text-align:left;white-space:normal}
.performance-popover__content{box-sizing:border-box;overflow:auto;overscroll-behavior:contain;padding:var(--performance-popover-padding-y) var(--performance-popover-padding-x);border:var(--performance-popover-border-width) solid var(--performance-popover-border);border-radius:var(--performance-popover-radius);background:var(--performance-popover-background);box-shadow:var(--performance-popover-shadow);overflow-wrap:anywhere}
.performance-popover__arrow{position:absolute;bottom:0;line-height:0;pointer-events:none}
.performance-popover__arrow svg{position:absolute;width:var(--performance-popover-arrow-width);height:var(--performance-popover-arrow-height);transform:translate(-50%,-1px)}
.performance-popover__arrow path{fill:var(--performance-popover-background);stroke:var(--performance-popover-border);stroke-width:var(--performance-popover-border-width)}
.performance-popover[data-placement="bottom"]>.performance-popover__arrow{top:0;bottom:auto}
.performance-popover[data-placement="bottom"]>.performance-popover__arrow svg{transform:translate(-50%,1px) rotate(180deg)}
.performance-popover[data-placement="right"]>.performance-popover__arrow{left:0;bottom:auto}
.performance-popover[data-placement="left"]>.performance-popover__arrow{right:0;bottom:auto}
.performance-popover[data-placement="right"]>.performance-popover__arrow svg,.performance-popover[data-placement="left"]>.performance-popover__arrow svg{width:var(--performance-popover-arrow-height);height:var(--performance-popover-arrow-width)}
.performance-popover[data-placement="right"]>.performance-popover__arrow svg{transform:translate(calc(-100% + 1px),-50%) rotate(180deg)}
.performance-popover[data-placement="left"]>.performance-popover__arrow svg{transform:translate(-1px,-50%)}
.performance-popover.is-dark { --performance-popover-background: #1f2329; --performance-popover-border: #1f2329; --performance-popover-border-width: 0px; --performance-popover-radius: 4px; --performance-popover-padding-y: 4px; --performance-popover-padding-x: 8px; --performance-popover-shadow: none; --performance-popover-min-width: 0; color: #fff; }
</style>
