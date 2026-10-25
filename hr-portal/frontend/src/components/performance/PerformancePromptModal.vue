<template>
  <PerformanceDialogShell
    :model-value="open"
    title="添加提示"
    width="600px"
    @close="close"
    @update:model-value="emit('update:open', $event)"
  >
    <PerformancePromptForm v-model="draft" class="prompt-modal__body" :invalid="submitted" />

    <template #footer>
      <div class="prompt-modal__footer">
        <PerformanceButton variant="primary" :disabled="!draft.content.trim()" @click="confirm">确定</PerformanceButton>
        <PerformanceButton variant="secondary" @click="close">取消</PerformanceButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformancePromptForm, { type PerformancePromptValue } from './PerformancePromptForm.vue'

const DEFAULT_PROMPT: PerformancePromptValue = { title: '', content: '', color: '#3B82F6', scope: 'all', showIcon: false }
const props = withDefaults(defineProps<{
  open: boolean
  initialValue?: PerformancePromptValue
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
