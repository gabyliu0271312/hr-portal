<template>
  <PerformanceDialogShell
    :model-value="open"
    title="添加提示"
    width="600px"
    @close="close"
    @update:model-value="emit('update:open', $event)"
  >
    <PerformancePromptForm v-model="draft" :scope-disabled="scopeDisabled" class="prompt-modal__body" :invalid="submitted" />

    <template #footer>
      <div class="prompt-modal__footer">
        <UiButton variant="primary" :disabled="!draft.content.trim()" @click="confirm">确定</UiButton>
        <UiButton variant="secondary" @click="close">取消</UiButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import UiButton from '../ui/UiButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformancePromptForm, { type PerformancePromptValue } from './PerformancePromptForm.vue'

const DEFAULT_PROMPT: PerformancePromptValue = { title: '', content: '', color: '#3B82F6', scope: 'all', showIcon: false }
const props = withDefaults(defineProps<{
  open: boolean
  initialValue?: PerformancePromptValue
  scopeDisabled?: boolean
}>(), { initialValue: undefined })
const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [value: PerformancePromptValue]
}>()
const draft = ref<PerformancePromptValue>(clone(props.initialValue || DEFAULT_PROMPT))
const submitted = ref(false)

function clone(value: PerformancePromptValue): PerformancePromptValue {
  return JSON.parse(JSON.stringify(value))
}
watch(() => props.open, value => {
  if (value) {
    draft.value = clone(props.initialValue || DEFAULT_PROMPT)
    submitted.value = false
  }
})
function close() { emit('update:open', false) }
function confirm() {
  submitted.value = true
  if (!draft.value.content.trim()) return
  emit('save', clone(draft.value))
  close()
}
</script>

<style scoped>
.prompt-modal__footer { display: flex; justify-content: flex-end; gap: var(--performance-button-gap); }
.prompt-modal__footer :deep(.performance-button) { min-width: var(--performance-button-min-width); }
</style>
