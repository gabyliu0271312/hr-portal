<template>
  <span class="performance-info-popover-root" :class="{ 'performance-info-popover-root--action': isAction, 'performance-info-popover-root--empty': !hasContent }">
    <span ref="anchor" class="performance-info-popover__anchor" :class="{ 'performance-info-popover__anchor--action': isAction, 'invite-info-icon': !isAction, 'performance-info-popover__anchor--empty': !hasContent }" :tabindex="hasContent ? 0 : -1" :style="{ color: iconColor }" :aria-label="hasContent ? ariaLabel : undefined" :aria-hidden="!hasContent" :aria-describedby="visible ? tooltipId : undefined" @mouseenter="scheduleOpen" @mouseleave="scheduleClose" @focusin="scheduleOpen" @focusout="close">
      <slot><svg width="16" height="16" viewBox="0 0 24 24" fill="none" data-icon="InfoOutlined" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 2C5.925 23 1 18.075 1 12S5.925 1 12 1s11 4.925 11 11-4.925 11-11 11Zm-1-7.5v-4a1 1 0 1 1 0-2h1.004c.55 0 .998.445.998.996.003 1.668-.002 3.336-.002 5.004h.5a1 1 0 1 1 0 2h-3a1 1 0 1 1 0-2h.5Zm1-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" fill="currentColor" /></svg></slot>
    </span>
    <PerformancePopover v-if="hasContent" :id="tooltipId" :visible="visible" :anchor="anchor" :width="width" :gap="gap" :viewport-margin="viewportMargin" name="performance-info-popover" :class="{ 'performance-info-popover--action': isAction, 'invite-info-tooltip': !isAction }" content-class="performance-info-popover__content" arrow-class="performance-info-popover__arrow" @close="close" @mouseenter="keepOpen" @mouseleave="scheduleClose">
      <template v-if="Array.isArray(content)">
        <div v-for="line in content" :key="line" class="performance-info-popover__line invite-info-line"><span class="performance-info-popover__dot invite-info-dot" aria-hidden="true" /><span>{{ line }}</span></div>
      </template>
      <span v-else-if="preserveNewlines" class="performance-info-popover__multiline">{{ content }}</span>
      <template v-else>{{ content }}</template>
    </PerformancePopover>
  </span>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onBeforeUnmount, ref } from 'vue'
import PerformancePopover from './PerformancePopover.vue'

const props = withDefaults(defineProps<{ content?: string | string[]; delay?: number; width?: number | 'auto'; variant?: 'info' | 'disabled-action'; gap?: number; viewportMargin?: number; iconColor?: string; ariaLabel?: string; preserveNewlines?: boolean }>(), { content: '', delay: 124, width: 420, variant: 'info', gap: 10, viewportMargin: 16, iconColor: 'var(--performance-info-icon-color)', ariaLabel: '查看说明', preserveNewlines: false })
const tooltipId = `performance-info-popover-${getCurrentInstance()!.uid}`
const isAction = computed(() => props.variant === 'disabled-action')
const hasContent = computed(() => Array.isArray(props.content) ? props.content.some(line => line.trim()) : Boolean(props.content.trim()))
const anchor = ref<HTMLElement | null>(null)
const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null
let closeTimer: ReturnType<typeof setTimeout> | null = null

function keepOpen() { if (closeTimer !== null) clearTimeout(closeTimer); closeTimer = null }
function scheduleClose() {
  if (!isAction.value) return close()
  if (timer !== null) clearTimeout(timer)
  timer = null
  keepOpen()
  if (visible.value) closeTimer = setTimeout(close, 124)
}
function scheduleOpen() {
  if (!hasContent.value) return
  keepOpen()
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(() => { visible.value = true; timer = null }, props.delay)
}
function close() {
  keepOpen()
  if (timer !== null) clearTimeout(timer)
  timer = null
  visible.value = false
}
onBeforeUnmount(close)
</script>

<style scoped>
.performance-info-popover-root{display:inline-flex;flex:0 0 var(--performance-info-icon-size);width:var(--performance-info-icon-size);height:var(--performance-info-icon-size);vertical-align:middle}.performance-info-popover-root--empty{flex:none;width:auto;height:auto}.performance-info-popover__anchor{display:block;flex:0 0 var(--performance-info-icon-size);width:var(--performance-info-icon-size);height:var(--performance-info-icon-size);color:var(--performance-info-icon-color);line-height:var(--performance-info-icon-size);cursor:default}.performance-info-popover__anchor svg{display:block;width:var(--performance-info-icon-size);height:var(--performance-info-icon-size)}.performance-info-popover__anchor:focus-visible{outline:2px solid var(--color-primary-hover);outline-offset:2px;border-radius:999px}.performance-info-popover__anchor--empty{cursor:inherit}.performance-info-popover__line{display:flex;align-items:flex-start}.performance-info-popover__dot{display:block;flex:0 0 4px;width:4px;height:4px;margin:9px 8px 0 0;border-radius:999px;background:#8f959e}.performance-info-popover__multiline{display:block;white-space:pre-line}.performance-info-popover-root--action{display:inline-flex;flex:none;width:auto;height:auto}.performance-info-popover__anchor--action{display:inline-flex;flex:none;width:auto;height:auto;line-height:var(--performance-popover-line-height);cursor:not-allowed}.performance-info-popover__anchor--action:focus-visible{outline:0;border-radius:var(--performance-button-radius);box-shadow:var(--performance-button-focus-ring)}.performance-info-popover__anchor--action :deep(button:disabled){pointer-events:none}.performance-info-popover--action{max-width:calc(100vw - 32px)}
</style>
