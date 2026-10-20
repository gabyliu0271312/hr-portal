<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceCountedTextarea from './PerformanceCountedTextarea.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  chinese: string
  english: string
  saving?: boolean
  saveError?: string
  kind?: 'authorization' | 'transfer'
}>(), { saving: false, saveError: '', kind: 'authorization' })
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [value: { authorization_prompt_zh: string; authorization_prompt_en: string } | { transfer_prompt_zh: string; transfer_prompt_en: string }]
}>()
const form = ref<HTMLFormElement | null>(null)
const chinese = ref('')
const english = ref('')
let returnFocus: HTMLElement | null = null

watch(() => props.modelValue, async open => {
  if (open) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    chinese.value = props.chinese
    english.value = props.english
    await nextTick()
    form.value?.querySelector('textarea')?.focus()
    document.addEventListener('keydown', trapFocus)
  } else {
    document.removeEventListener('keydown', trapFocus)
    returnFocus?.focus()
  }
}, { immediate: true })
onBeforeUnmount(() => document.removeEventListener('keydown', trapFocus))

function trapFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const controls = Array.from(form.value?.closest('[role="dialog"]')?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled)') || [])
  if (!controls.length) { event.preventDefault(); return }
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

function confirm() {
  if (props.saving) return
  emit('confirm', props.kind === 'transfer'
    ? { transfer_prompt_zh: chinese.value, transfer_prompt_en: english.value }
    : { authorization_prompt_zh: chinese.value, authorization_prompt_en: english.value })
}
</script>

<template>
  <PerformanceDialogShell :model-value="modelValue" :title="kind === 'transfer' ? '转交提示' : '授权提示'" :title-id="`${kind}-prompt-title`" width="var(--performance-dialog-wide-width)" :loading="saving" dialog-class="authorization-prompt-dialog" @update:model-value="emit('update:modelValue', $event)">
    <form ref="form" class="authorization-prompt-form" @submit.prevent="confirm">
      <PerformanceCountedTextarea v-model="chinese" :label="kind === 'transfer' ? '中文转交提示' : '中文授权提示'" :input-id="`${kind}-prompt-zh`" :max-length="1000" hide-label language="中文" height="116px" :disabled="saving" />
      <PerformanceCountedTextarea v-model="english" :label="kind === 'transfer' ? '英文转交提示' : '英文授权提示'" :input-id="`${kind}-prompt-en`" :max-length="1000" hide-label language="英文" height="116px" :disabled="saving" />
      <p v-if="saveError" class="authorization-prompt-error" role="alert">{{ saveError }}</p>
    </form>
    <template #footer>
      <div class="authorization-prompt-actions">
        <PerformanceButton :disabled="saving" @click="emit('update:modelValue', false)">取消</PerformanceButton>
        <PerformanceButton variant="primary" :loading="saving" @click="confirm">确定</PerformanceButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<style scoped>
.authorization-prompt-form { display: flex; flex-direction: column; gap: var(--spacing-5); padding-bottom: var(--spacing-5); }
.authorization-prompt-form :deep(.performance-counted-textarea) { width: 100%; margin: 0; }
.authorization-prompt-form :deep(textarea) { border-width: 1px; resize: none; }
.authorization-prompt-error { margin: 0; color: var(--performance-field-error-color); font-size: var(--font-size-sm); line-height: 20px; }
.authorization-prompt-actions { display: flex; justify-content: flex-end; gap: var(--performance-dialog-footer-gap); }
</style>
