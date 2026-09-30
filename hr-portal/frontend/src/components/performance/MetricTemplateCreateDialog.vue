<template>
  <PerformanceDialogShell v-model="open" :title="mode === 'edit' ? '编辑指标模板' : '新建指标模板'" width="600px" :loading="saving" @close="reset">
    <form id="metric-template-create-form" @submit.prevent="submit">
      <PerformanceLocalizedInput
        v-model="form.name"
        label="名称"
        input-id="metric-template-name"
        placeholder="请输入名称"
        required
        :invalid="Boolean(nameError)"
        :error-message="nameError"
        @update:model-value="nameError = ''; notice = ''"
        @add-language="showLanguageNotice"
      />
      <PerformanceLocalizedInput
        v-model="form.description"
        label="描述"
        input-id="metric-template-description"
        placeholder="请输入"
        @update:model-value="notice = ''"
        @add-language="showLanguageNotice"
      />
      <div class="metric-template-group-setting">
        <div class="metric-template-group-setting__row">
          <span>分人群设置指标内容</span>
          <PerformanceSwitch v-model="form.byAudience" size="medium" aria-label="分人群设置指标内容" />
        </div>
        <p>可添加多个人群，并为各人群设置不同的指标内容</p>
      </div>
      <p v-if="notice" class="metric-template-dialog-notice" role="status">{{ notice }}</p>
      <p v-if="errorMessage" class="metric-template-dialog-error" role="alert">{{ errorMessage }}</p>
    </form>
    <template #footer>
      <div class="metric-template-dialog-footer">
        <PerformanceButton variant="secondary" :disabled="saving" @click="close">取消</PerformanceButton>
        <PerformanceButton variant="primary" :loading="saving" @click="submit">确定</PerformanceButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceLocalizedInput from './PerformanceLocalizedInput.vue'
import PerformanceSwitch from './PerformanceSwitch.vue'

export interface MetricTemplateDraft {
  name: string
  description: string
  byAudience: boolean
}

const props = withDefaults(defineProps<{ modelValue: boolean; mode?: 'create' | 'edit'; initialValue?: Partial<MetricTemplateDraft> | null; saving?: boolean; errorMessage?: string }>(), { mode: 'create', initialValue: null, saving: false, errorMessage: '' })
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [value: MetricTemplateDraft]
}>()
const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const form = reactive<MetricTemplateDraft>({ name: '', description: '', byAudience: false })
const nameError = ref('')
const notice = ref('')

function reset(value: Partial<MetricTemplateDraft> | null = null) {
  form.name = value?.name || ''
  form.description = value?.description || ''
  form.byAudience = value?.byAudience || false
  nameError.value = ''
  notice.value = ''
}
function close() {
  if (props.saving) return
  reset()
  open.value = false
}
function showLanguageNotice() {
  notice.value = '添加英文功能暂未接入'
}
function submit() {
  nameError.value = form.name.trim() ? '' : '请输入名称'
  if (nameError.value || props.saving) return
  emit('confirm', { name: form.name.trim(), description: form.description.trim(), byAudience: form.byAudience })
}
watch(() => props.modelValue, value => { if (value) reset(props.initialValue) }, { immediate: true })
</script>

<style scoped>
#metric-template-create-form { margin: 0; }
.metric-template-group-setting__row { display: flex; align-items: center; gap: var(--spacing-4); color: var(--color-text-primary); font-size: var(--font-size-md); font-weight: 600; line-height: var(--performance-input-line-height); }
.metric-template-group-setting p { margin: var(--spacing-2) 0 0; color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: var(--performance-input-line-height); }
.metric-template-dialog-error { margin: var(--spacing-2) 0 0; color: var(--color-text-danger-strong); font-size: var(--font-size-sm); line-height: 20px; }
.metric-template-dialog-notice { margin: var(--spacing-4) 0 0; color: var(--color-text-secondary); font-size: var(--font-size-sm); line-height: 20px; }
.metric-template-dialog-footer { display: flex; flex-direction: row-reverse; gap: var(--spacing-3); }
</style>
