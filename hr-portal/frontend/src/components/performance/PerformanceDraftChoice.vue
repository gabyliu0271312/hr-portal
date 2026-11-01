<template>
  <PerformancePopover role="dialog" aria-label="有未提交的草稿，是否使用？" :visible="visible" :anchor="anchor" :width="255" :gap="8" name="performance-draft-choice" content-class="performance-draft-choice__content" @close="close">
    <div ref="dialog" @keydown="onKeydown" @keydown.esc.stop="close">
      <div class="draft-choice-title"><span class="draft-choice-icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24"><path :d="promptDefinitions.info.iconPath" fill="currentColor" /><path :d="promptDefinitions.info.iconInnerPath" fill="#fff" /></svg></span><strong>有未提交的草稿，是否使用？</strong></div>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="draft-choice-buttons"><PerformanceButton size="small" :disabled="busy" @click="choose('discard')">不使用</PerformanceButton><PerformanceButton size="small" variant="primary" :disabled="busy" @click="choose('use')">使用草稿</PerformanceButton></div>
    </div>
  </PerformancePopover>
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { performanceReviewApi, type PerformanceTemplateTask } from '@/api/performance'
import PerformancePopover from './PerformancePopover.vue'
import PerformanceButton from './PerformanceButton.vue'
import { promptDefinitions } from './PerformancePromptNotice.vue'
const props = defineProps<{ visible: boolean; anchor: HTMLElement | null; task: PerformanceTemplateTask; employeeNo?: string }>()
const emit = defineEmits<{ close: []; choose: [choice: 'use' | 'discard'] }>()
const dialog = ref<HTMLElement | null>(null)
const busy = ref(false)
const error = ref('')
function close() { if (!busy.value) emit('close') }
function outside(event: MouseEvent) {
  if (busy.value || dialog.value?.contains(event.target as Node) || props.anchor?.contains(event.target as Node)) return
  close()
}
watch(() => props.visible, async open => {
  document.removeEventListener('mousedown', outside)
  if (open) {
    error.value = ''
    await nextTick()
    if (!props.visible) return
    dialog.value?.querySelector<HTMLButtonElement>('button')?.focus()
    document.addEventListener('mousedown', outside)
  } else props.anchor?.querySelector<HTMLButtonElement>('button')?.focus()
}, { immediate: true })
onBeforeUnmount(() => document.removeEventListener('mousedown', outside))
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const buttons = dialog.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
  if (!buttons?.length) return
  const target = event.shiftKey ? buttons[0] : buttons[buttons.length - 1]
  if (document.activeElement === target) { event.preventDefault(); buttons[event.shiftKey ? buttons.length - 1 : 0].focus() }
}
async function choose(choice: 'use' | 'discard') {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    if (choice === 'discard') await performanceReviewApi.discardTaskDraft(props.task.task_id, props.task.task_kind, props.task.version!, props.employeeNo)
    emit('choose', choice)
  } catch { error.value = '草稿处理失败，请重试' }
  finally { busy.value = false }
}
</script>
<style scoped>
.draft-choice-title{display:flex;gap:8px;color:var(--color-text-primary);font-size:14px;line-height:22px}.draft-choice-title strong{font-weight:600;white-space:nowrap}.draft-choice-icon{flex:none;color:#1456f0;line-height:22px}.draft-choice-icon svg{vertical-align:-2px}.draft-choice-buttons{--performance-button-primary-background:#1456f0;display:flex;justify-content:flex-end;gap:12px;margin-top:16px}.draft-choice-buttons :deep(.performance-button){height:28px;min-width:48px;padding:3px 7px;font:400 12px/20px var(--font-sans)}p{color:var(--color-text-danger);font-size:12px}
:global(.performance-draft-choice){--performance-popover-padding-y:20px;--performance-popover-padding-x:24px;--performance-popover-radius:8px;--performance-popover-min-width:0;--performance-popover-shadow:0 4px 8px rgba(31,35,41,.1)}:global(.performance-draft-choice>.performance-popover__arrow){display:none}
</style>
