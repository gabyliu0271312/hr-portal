<template>
  <span class="performance-info-popover-root">
  <span
    ref="anchor"
    class="performance-info-popover__anchor invite-info-icon"
    tabindex="0"
    :style="{ color: iconColor }"
    :aria-describedby="visible ? tooltipId : undefined"
    @mouseenter="scheduleOpen"
    @mouseleave="close"
    @focusin="scheduleOpen"
    @focusout="close"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" data-icon="InfoOutlined" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 2C5.925 23 1 18.075 1 12S5.925 1 12 1s11 4.925 11 11-4.925 11-11 11Zm-1-7.5v-4a1 1 0 1 1 0-2h1.004c.55 0 .998.445.998.996.003 1.668-.002 3.336-.002 5.004h.5a1 1 0 1 1 0 2h-3a1 1 0 1 1 0-2h.5Zm1-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" fill="currentColor" /></svg>
  </span>
  <Teleport to="body">
    <div
      v-if="visible"
      :id="tooltipId"
      ref="popover"
      class="performance-info-popover invite-info-tooltip"
      :class="`performance-info-popover--${placement}`"
      role="tooltip"
      :style="popoverStyle"
    >
      <div class="performance-info-popover__content">
        <template v-if="Array.isArray(content)">
          <div v-for="line in content" :key="line" class="performance-info-popover__line invite-info-line"><span class="performance-info-popover__dot invite-info-dot" aria-hidden="true" /><span>{{ line }}</span></div>
        </template>
        <template v-else>{{ content }}</template>
      </div>
      <div class="performance-info-popover__arrow" :style="arrowStyle"><svg width="16" height="8" viewBox="0 0 16 8" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8-.5H0v1c1.553 0 3.033.664 4.065 1.825l2.814 3.166a1.5 1.5 0 002.242 0l2.814-3.166A5.438 5.438 0 0116 .5v-1H8z" /></svg></div>
    </div>
  </Teleport>
  </span>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'

let nextTooltipId = 0
const props = withDefaults(defineProps<{
  content: string | string[]
  delay?: number
  width?: number
  gap?: number
  viewportMargin?: number
  iconColor?: string
}>(), {
  delay: 124,
  width: 420,
  gap: 10,
  viewportMargin: 16,
  iconColor: '#646a73',
})

const tooltipId = `performance-info-popover-${++nextTooltipId}`
const anchor = ref<HTMLElement | null>(null)
const popover = ref<HTMLElement | null>(null)
const visible = ref(false)
const placement = ref<'top' | 'bottom'>('top')
const popoverStyle = ref<Record<string, string>>({ width: `${props.width}px`, visibility: 'hidden' })
const arrowStyle = ref<Record<string, string>>({})
let timer: ReturnType<typeof setTimeout> | null = null

function updatePosition() {
  if (!visible.value || !anchor.value || !popover.value) return
  const anchorRect = anchor.value.getBoundingClientRect()
  const popoverRect = popover.value.getBoundingClientRect()
  const centerX = anchorRect.left + anchorRect.width / 2
  const maxLeft = Math.max(props.viewportMargin, window.innerWidth - popoverRect.width - props.viewportMargin)
  const left = Math.min(Math.max(props.viewportMargin, centerX - popoverRect.width / 2), maxLeft)
  const placeTop = anchorRect.top >= popoverRect.height + props.gap + props.viewportMargin
  placement.value = placeTop ? 'top' : 'bottom'
  popoverStyle.value = {
    width: `${props.width}px`,
    left: `${left}px`,
    top: `${placeTop ? anchorRect.top - popoverRect.height - props.gap : anchorRect.bottom + props.gap}px`,
    visibility: 'visible',
  }
  arrowStyle.value = { left: `${Math.min(Math.max(8, centerX - left), popoverRect.width - 8)}px` }
}

function scheduleOpen() {
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(() => {
    visible.value = true
    timer = null
    void nextTick(updatePosition)
  }, props.delay)
}

function close() {
  if (timer !== null) clearTimeout(timer)
  timer = null
  visible.value = false
}

window.addEventListener('resize', updatePosition)
window.addEventListener('scroll', updatePosition, true)
onBeforeUnmount(() => {
  close()
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
})
</script>

<style scoped>
.performance-info-popover-root{display:block;flex:0 0 16px;width:16px;height:16px}
.performance-info-popover{width:420px}
.performance-info-popover__anchor{display:block;flex:0 0 16px;width:16px;height:16px;color:#646a73;line-height:16px;cursor:default}.performance-info-popover__anchor svg{display:block;width:16px;height:16px}.performance-info-popover__anchor:focus-visible{outline:2px solid #1456f0;outline-offset:2px;border-radius:999px}.performance-info-popover{position:fixed;z-index:1030;box-sizing:border-box;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}.performance-info-popover__content{width:100%;min-height:47.333px;overflow:hidden;padding:12px 16px;box-sizing:border-box;border:.666667px solid #dee0e3;border-radius:8px;background:#fff;box-shadow:rgba(31,35,41,.04) 0 8px 24px 8px,rgba(31,35,41,.04) 0 6px 12px 0,rgba(31,35,41,.06) 0 4px 8px -8px}.performance-info-popover__line{display:flex;align-items:flex-start}.performance-info-popover__dot{display:block;flex:0 0 4px;width:4px;height:4px;margin:9px 8px 0 0;border-radius:999px;background:#8f959e}.performance-info-popover__arrow{position:absolute;line-height:0}.performance-info-popover__arrow svg{position:absolute;display:flex;transform:translate(-50%,-1px)}.performance-info-popover__arrow path{fill:#fff;stroke:#dee0e3;stroke-width:.666667px}.performance-info-popover--top .performance-info-popover__arrow{bottom:0}.performance-info-popover--bottom .performance-info-popover__arrow{top:0}.performance-info-popover--bottom .performance-info-popover__arrow svg{transform:translate(-50%,1px) rotate(180deg)}
</style>
