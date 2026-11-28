<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import PerformanceBilingualField from './PerformanceBilingualField.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import UiButton from '../ui/UiButton.vue'

export interface PerformanceRoleFormValue {
  name: { zh: string; en: string }
  description: { zh: string; en: string }
}

const props = withDefaults(defineProps<{
  modelValue: boolean
  title: string
  loading?: boolean
  initial?: PerformanceRoleFormValue
}>(), {
  loading: false,
  initial: () => ({ name: { zh: '', en: '' }, description: { zh: '', en: '' } }),
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [payload: PerformanceRoleFormValue]
}>()

const form = reactive<PerformanceRoleFormValue>({ ...props.initial })

watch(() => props.modelValue, visible => {
  if (visible) {
    form.name = { zh: props.initial.name.zh, en: props.initial.name.en }
    form.description = { zh: props.initial.description.zh, en: props.initial.description.en }
  }
}, { immediate: true })

const canSubmit = computed(() => form.name.zh.trim().length > 0)

function cancel() {
  if (props.loading) return
  emit('update:modelValue', false)
}
function submit() {
  if (props.loading || !canSubmit.value) return
  emit('submit', { name: { zh: form.name.zh.trim(), en: form.name.en.trim() }, description: { zh: form.description.zh.trim(), en: form.description.en.trim() } })
}
</script>

<template>
  <PerformanceDialogShell
    :model-value="modelValue"
    :title="title"
    :width="'var(--performance-dialog-wide-width)'"
    :loading="loading"
    :dismissible="!loading"
    @close="cancel"
    @update:model-value="cancel"
  >
    <PerformanceBilingualField v-model="form.name" label="名称" required type="input" :max-length="64" input-id="role-name-zh" />
    <PerformanceBilingualField v-model="form.description" label="描述" type="textarea" :max-length="2000" input-id="role-desc-zh" />
    <template #footer>
      <UiButton variant="secondary" :disabled="loading" @click="cancel">取消</UiButton>
      <UiButton variant="primary" :loading="loading" :disabled="!canSubmit" @click="submit">确定</UiButton>
    </template>
  </PerformanceDialogShell>
</template>
