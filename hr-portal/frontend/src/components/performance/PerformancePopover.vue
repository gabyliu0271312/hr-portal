<template>
  <Teleport to="body">
    <div v-if="visible && anchor" v-bind="$attrs" ref="popover" class="performance-popover" :class="[name, `${name}--${placement}`]" :data-placement="placement" :style="position" role="tooltip" @mouseenter="$emit('mouseenter')" @mouseleave="$emit('mouseleave')">
      <div class="performance-popover__content" :class="contentClass"><slot /></div>
      <div class="performance-popover__arrow" :class="[arrowClass, `performance-popover__arrow--${placement}`]" :style="{ left: `${arrowLeft}px` }" aria-hidden="true">
        <svg width="16" height="8" viewBox="0 0 16 8" fill="none"><path d="M8-.5H0v1c1.553 0 3.033.664 4.065 1.825l2.814 3.166a1.5 1.5 0 002.242 0l2.814-3.166A5.438 5.438 0 0116 .5v-1H8z" /></svg>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{
  visible: boolean
  anchor: HTMLElement | DOMRect | null
  width?: number | 'auto'
  gap?: number
  viewportMargin?: number
  name?: string
  contentClass?: string
  arrowClass?: string
}>(), { name: 'performance-popover' })
const emit = defineEmits<{ close: []; mouseenter: []; mouseleave: [] }>()
const popover = ref<HTMLElement | null>(null)
const placement = ref<'top' | 'bottom'>('top')
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
  const gap = props.gap ?? token('--performance-popover-gap', 10)
  const width = props.width === 'auto' ? 'max-content' : `${props.width ?? token('--performance-popover-width', 420)}px`
  panel.style.width = width
  panel.style.maxWidth = `${Math.max(0, window.innerWidth - margin * 2)}px`
  const above = Math.max(0, rect.top - gap - margin)
  const below = Math.max(0, window.innerHeight - rect.bottom - gap - margin)
  const content = panel.querySelector<HTMLElement>('.performance-popover__content')!
  const naturalHeight = Math.max(content.scrollHeight, panel.getBoundingClientRect().height)
  const top = above >= naturalHeight || above >= below
  placement.value = top ? 'top' : 'bottom'
  content.style.maxHeight = `${top ? above : below}px`
  const size = panel.getBoundingClientRect()
  const center = rect.left + rect.width / 2
  const left = Math.max(margin, Math.min(center - size.width / 2, window.innerWidth - size.width - margin))
  position.value = { width, maxWidth: `${Math.max(0, window.innerWidth - margin * 2)}px`, left: `${left}px`, top: `${Math.max(margin, top ? rect.top - size.height - gap : rect.bottom + gap)}px`, visibility: 'visible' }
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
watch(() => [props.visible, props.anchor, props.width, props.gap, props.viewportMargin], () => {
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
</style>
