<template>
  <PerformanceDialogShell
    v-model="open"
    :title="mode === 'edit' ? '编辑评分公式' : '添加评分公式'"
    width="1000px"
    :loading="saving"
    dialog-class="performance-formula-create-dialog"
    @close="cancel"
  >
    <form class="formula-create-form" @submit.prevent="submit">
      <PerformanceFormItem
        label="公式名称"
        required
        :invalid="Boolean(errors.name)"
        :error-message="errors.name"
        error-id="formula-name-error"
      >
        <PerformanceTextField
          v-model="draft.name"
          input-id="formula-name"
          aria-label="公式名称"
          :invalid="Boolean(errors.name)"
          @update:model-value="clearError('name')"
        />
      </PerformanceFormItem>

      <PerformanceFormItem
        label="公式编辑器"
        required
        :invalid="Boolean(errors.formula)"
        :error-message="errors.formula"
        error-id="formula-editor-error"
      >
        <PerformanceFormulaEditor
          v-model="draft.formula"
          :invalid="Boolean(errors.formula)"
          :functions="functions"
          :fields="fields"
          :operators="operators"
          @update:model-value="clearError('formula')"
          @insert="emit('insert', $event)"
        />
      </PerformanceFormItem>
    </form>

    <template #footer>
      <div class="formula-create-footer">
        <PerformanceButton variant="text" aria-label="公式编辑器帮助" @click="emit('help')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 2C5.925 23 1 18.075 1 12S5.925 1 12 1s11 4.925 11 11-4.925 11-11 11Zm-1-6a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM8.05 9.282a5.17 5.17 0 0 1 .039-.28c.195-1.085.689-1.883 1.481-2.394.62-.405 1.383-.608 2.288-.608 1.189 0 2.176.288 2.962.864.787.575 1.18 1.428 1.18 2.558 0 .693-.17 1.277-.513 1.752-.2.287-.584.655-1.152 1.103l-.56.44c-.305.24-.507.52-.607.84a2.742 2.742 0 0 0-.072.486.5.5 0 0 1-.498.457h-1.12a.5.5 0 0 1-.498-.546c.065-.696.134-1.136.207-1.321.137-.344.49-.74 1.058-1.188l.575-.455c.19-.144 1.166-.831 1.166-1.44 0-.608-.106-.832-.412-1.166-.305-.333-.993-.44-1.613-.44-.61 0-1.132.161-1.387.572-.118.19-.215.393-.284.6a2.097 2.097 0 0 0-.073.307.5.5 0 0 1-.493.415H8.547a.5.5 0 0 0-.497-.556Z" fill="currentColor" />
          </svg>
        </PerformanceButton>
        <span class="formula-create-footer__spacer" />
        <PerformanceButton variant="secondary" :disabled="saving" @click="cancel">取消</PerformanceButton>
        <PerformanceButton variant="primary" :loading="saving" @click="submit">确认</PerformanceButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceFormulaEditor, { type PerformanceFormulaResource } from './PerformanceFormulaEditor.vue'
import PerformanceTextField from './PerformanceTextField.vue'

export interface PerformanceFormulaDraft {
  name: string
  formula: string
}

type FormulaErrorKey = keyof PerformanceFormulaDraft
type FormulaErrors = Partial<Record<FormulaErrorKey, string>>

const props = withDefaults(defineProps<{
  modelValue: boolean
  mode?: 'create' | 'edit'
  initialValue?: Partial<PerformanceFormulaDraft> | null
  functions?: PerformanceFormulaResource[]
  fields?: PerformanceFormulaResource[]
  operators?: PerformanceFormulaResource[]
  saving?: boolean
}>(), {
  mode: 'create',
  initialValue: null,
  functions: undefined,
  fields: undefined,
  operators: undefined,
  saving: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [value: PerformanceFormulaDraft]
  cancel: []
  help: []
  insert: [resource: PerformanceFormulaResource]
}>()

const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const draft = reactive<PerformanceFormulaDraft>({ name: props.initialValue?.name || '', formula: props.initialValue?.formula || '' })
const errors = reactive<FormulaErrors>({})

function reset(value: Partial<PerformanceFormulaDraft> | null = null) {
  draft.name = value?.name || ''
  draft.formula = value?.formula || ''
  clearErrors()
}

function clearErrors() {
  Object.keys(errors).forEach(key => delete errors[key as FormulaErrorKey])
}

function clearError(key: FormulaErrorKey) {
  delete errors[key]
}

function validate() {
  clearErrors()
  if (!draft.name.trim()) errors.name = '请输入公式名称'
  if (!draft.formula.trim()) errors.formula = '请输入公式内容'
  return !Object.keys(errors).length
}

function submit() {
  if (props.saving || !validate()) return
  emit('confirm', { name: draft.name.trim(), formula: draft.formula.trim() })
  open.value = false
}

function cancel() {
  if (props.saving) return
  emit('cancel')
  open.value = false
}

watch(() => props.modelValue, value => {
  if (value) reset(props.initialValue)
})
</script>

<style scoped>
.formula-create-form { margin: 0; }
.formula-create-footer { display: flex; align-items: center; gap: var(--performance-dialog-footer-gap); }
.formula-create-footer__spacer { flex: 1; }
.formula-create-footer :deep(.performance-button:first-child) { min-width: 28px; padding-inline: var(--spacing-1); color: var(--color-text-secondary); }
.formula-create-footer :deep(.performance-button:first-child svg) { display: block; }
.formula-create-footer :deep(.performance-button:not(:first-child)) { min-width: var(--performance-dialog-button-width); }
@media (max-width: 860px) {
  .formula-create-footer { flex-wrap: wrap; }
}
</style>
