<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import PerformancePopover from './PerformancePopover.vue'
const trigger = ref<HTMLElement | null>(null)
const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
function open() { clearTimeout(timer); visible.value = true }
function close() { clearTimeout(timer); visible.value = false }
function scheduleClose() { clearTimeout(timer); timer = setTimeout(close, 120) }
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <span ref="trigger" class="announcement-example-trigger" @mouseenter="open" @mouseleave="scheduleClose">
    <button class="announcement-example-link" type="button" aria-label="查看知悉公告示例" :aria-expanded="visible" @focus="open" @blur="scheduleClose" @click="open" @keydown.esc.stop.prevent="close">查看示例</button>
  </span>
  <PerformancePopover :visible="visible" :anchor="trigger" width="var(--performance-announcement-example-width)" name="announcement-example" @close="close" @mouseenter="open" @mouseleave="scheduleClose">
    <strong>示例</strong>
    <img class="announcement-example-image" src="/announcement-example/announcement-detail-cn.png" width="468" height="286" alt="公告弹窗布局示例，含查看详情和我已知悉按钮" />
  </PerformancePopover>
</template>

<style scoped>
.announcement-example-trigger { display: inline-flex; }
.announcement-example-link { padding: 0 4px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-primary); font: inherit; cursor: pointer; }
.announcement-example-link:hover { background: var(--color-bg-hover); }
.announcement-example-link:active { color: var(--color-primary-active); }
.announcement-example-link:focus-visible { outline: 0; box-shadow: var(--performance-button-focus-ring); }
.announcement-example-image { display: block; width: var(--performance-announcement-example-image-width); max-width: 100%; height: auto; margin-top: var(--spacing-2); }
</style>
