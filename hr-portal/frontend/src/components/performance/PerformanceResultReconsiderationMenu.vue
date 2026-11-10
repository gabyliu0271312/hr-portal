<template>
  <div v-if="status && status.window_open && !expired" class="reconsideration-menu" @mouseenter="show" @mouseleave="hideSoon" @focusout="leave" @keydown.esc="open = false">
    <UiButton class="reconsideration-more" aria-label="复议更多操作" :aria-expanded="open" @focus="show" @click="show"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="3.75" cy="12" r="1.75" /><circle cx="12" cy="12" r="1.75" /><circle cx="20.25" cy="12" r="1.75" /></svg></UiButton>
    <div v-if="open" class="reconsideration-menu__panel" role="menu" aria-label="复议操作">
      <button type="button" role="menuitem" :disabled="!status.can_submit || busy" @click="start"><span>发起复议</span><span class="reconsideration-menu__deadline">截止时间：{{ formatDisplayDateTime(status.deadline_at) }}（GMT+8）</span></button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import type { PerformanceReconsiderationStatus } from '@/api/performance'
import { formatDisplayDateTime } from '@/utils/datetime'
import UiButton from '../ui/UiButton.vue'
defineProps<{ status: PerformanceReconsiderationStatus | null; expired: boolean; busy?: boolean }>()
const emit = defineEmits<{ start: [] }>()
const open = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | undefined
function show() { clearTimeout(hideTimer); open.value = true }
function hideSoon() { hideTimer = setTimeout(() => { open.value = false }, 120) }
onBeforeUnmount(() => clearTimeout(hideTimer))
function start() { open.value = false; emit('start') }
function leave(event: FocusEvent) { if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) open.value = false }
</script>
<style scoped>
.reconsideration-menu{position:relative;flex:none;z-index:2}.reconsideration-more{min-width:32px;width:32px;padding:0}.reconsideration-menu__panel{position:absolute;right:0;top:100%;padding:var(--performance-menu-padding);width:243px;max-width:calc(100vw - 64px);box-sizing:border-box;border:1px solid var(--performance-popover-border);border-radius:var(--performance-menu-radius);background:var(--performance-popover-background);box-shadow:var(--performance-popover-shadow)}.reconsideration-menu__panel button{display:flex;flex-direction:column;width:100%;margin:1px 0;padding:4px var(--performance-menu-item-padding-inline);border:0;border-radius:var(--performance-menu-item-radius);background:transparent;color:var(--color-text-primary);font:400 14px/22px var(--font-sans);text-align:left;cursor:pointer}.reconsideration-menu__panel button:hover:not(:disabled),.reconsideration-menu__panel button:focus-visible{background:var(--performance-menu-item-hover-background)}.reconsideration-menu__panel button:disabled{cursor:not-allowed;color:var(--color-text-placeholder)}.reconsideration-menu__deadline{font-size:12px;line-height:20px;color:var(--color-text-placeholder);white-space:nowrap}
</style>
