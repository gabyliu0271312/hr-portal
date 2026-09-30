<template>
  <PerformanceDialogShell v-model="open" :title="mode === 'edit' ? '编辑指标类型' : '新建指标类型'" :loading="saving">
    <form id="metric-type-create-form" @submit.prevent="submit">
      <PerformanceFormItem label="名称" required :invalid="Boolean(nameError)" :error-message="nameError">
        <PerformanceTextField
          v-model="form.name"
          input-id="metric-type-name"
          placeholder="请输入"
          :maxlength="128"
          :disabled="saving"
          :invalid="Boolean(nameError)"
          aria-label="指标类型名称"
        />
      </PerformanceFormItem>

      <PerformanceFormItem label="指标字段" required :invalid="Boolean(fieldError)" :error-message="fieldError">
        <template #description><span class="metric-type-field-description">选择该类型所需填写的字段</span></template>
        <div class="metric-type-fields" aria-label="指标类型字段顺序">
          <div v-if="lockedFields.length" class="metric-type-fields__locked">
            <PerformanceMetricFieldRow v-for="field in lockedFields" :key="field.id" :field="field" locked />
          </div>

          <PerformanceSortableList v-if="sortableFields.length" :items="sortableFields" item-key="id" :disabled="saving" :gap="0" aria-label="指标字段排序" @reorder="reorderFields">
            <template #default="{ item: field, index, dragging, itemStyle }">
              <PerformanceMetricFieldRow :field="field" :index="index" :dragging="dragging" :disabled="saving" :item-style="itemStyle" @remove="removeField" />
            </template>
          </PerformanceSortableList>
          <span v-if="!selectedFields.length" class="metric-type-fields__empty">暂无可选指标字段</span>
          <div class="metric-type-fields__picker">
            <PerformanceTextButton label="选择字段" :disabled="saving" :aria-expanded="pickerOpen" @click="openPicker">
              <template #icon><AddOutlinedIcon /></template>
            </PerformanceTextButton>
          </div>
          <Teleport to="body">
            <div v-if="pickerOpen" class="metric-type-field-picker-layer" @mousedown.self="pickerOpen = false">
              <div class="metric-type-field-picker" role="dialog" aria-label="选择指标字段" @mousedown.stop>
                <div class="metric-type-field-picker__list" role="listbox" aria-label="可添加指标字段">
                  <PerformanceCheckbox
                    v-for="field in pickerFields"
                    :key="field.id"
                    :model-value="pickerFieldIds.includes(field.id)"
                    :label="field.name"
                    @update:model-value="togglePickerField(field.id, $event)"
                  >
                    <template #label>
                      <span class="metric-type-field-picker__label">
                        <PerformanceMetricFieldIcon :field-type="field.field_type" />
                        <span>{{ field.name }}</span>
                      </span>
                    </template>
                  </PerformanceCheckbox>
                  <span v-if="!pickerFields.length" class="metric-type-fields__empty">暂无可添加字段</span>
                </div>
                <PerformanceTextButton class="metric-type-field-picker__create" label="新建字段" @click="handleCreateField">
                  <template #icon><AddOutlinedIcon /></template>
                </PerformanceTextButton>
                <div class="metric-type-field-picker__footer">
                  <PerformanceButton variant="secondary" size="small" @click="pickerOpen = false">取消</PerformanceButton>
                  <PerformanceButton variant="primary" size="small" @click="confirmPicker">确定</PerformanceButton>
                </div>
              </div>
            </div>
          </Teleport>
        </div>
      </PerformanceFormItem>
      <p v-if="notice" class="metric-type-notice" role="status">{{ notice }}</p>
      <p v-if="errorMessage" class="metric-type-error" role="alert">{{ errorMessage }}</p>
    </form>
    <template #footer>
      <div class="metric-type-footer">
        <PerformanceButton variant="secondary" :disabled="saving" @click="open = false">取消</PerformanceButton>
        <PerformanceButton variant="primary" :loading="saving" @click="submit">确定</PerformanceButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import type { PerformanceMetricTypeDraft, PerformanceMetricTypeFieldOption } from '@/api/performanceMetricTypes'
import AddOutlinedIcon from './AddOutlinedIcon.vue'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceMetricFieldIcon from './PerformanceMetricFieldIcon.vue'
import PerformanceMetricFieldRow from './PerformanceMetricFieldRow.vue'
import PerformanceSortableList from './PerformanceSortableList.vue'
import PerformanceTextButton from './PerformanceTextButton.vue'
import PerformanceTextField from './PerformanceTextField.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  mode?: 'create' | 'edit'
  initialValue?: PerformanceMetricTypeDraft | null
  fieldOptions?: PerformanceMetricTypeFieldOption[]
  saving?: boolean
  errorMessage?: string
}>(), {
  mode: 'create', initialValue: null, fieldOptions: () => [], saving: false, errorMessage: '',
})

const emit = defineEmits<{ 'update:modelValue': [value: boolean]; confirm: [value: PerformanceMetricTypeDraft]; 'create-field': [] }>()
const open = computed({ get: () => props.modelValue, set: value => { if (!props.saving) emit('update:modelValue', value) } })
const form = reactive<PerformanceMetricTypeDraft>({ name: '', field_ids: [] })
const nameError = ref('')
const fieldError = ref('')
const notice = ref('')
const pickerOpen = ref(false)
const pickerFieldIds = ref<number[]>([])
const selectedFields = computed(() => form.field_ids.map(id => props.fieldOptions.find(field => field.id === id)).filter((field): field is PerformanceMetricTypeFieldOption => Boolean(field)))
const lockedFields = computed(() => selectedFields.value.filter(field => field.name === '指标'))
const sortableFields = computed(() => selectedFields.value.filter(field => field.name !== '指标'))
const lockedFieldIds = computed(() => new Set(lockedFields.value.map(field => field.id)))
const pickerFields = computed(() => props.fieldOptions.filter(field => !lockedFieldIds.value.has(field.id) && !form.field_ids.includes(field.id)))


function reorderFields(from: number, to: number) {
  if (from === to) return
  const next = sortableFields.value.map(field => field.id)
  const [moved] = next.splice(from, 1)
  if (moved === undefined) return
  next.splice(to, 0, moved)
  form.field_ids = [...lockedFields.value.map(field => field.id), ...next]
}
function removeField(id: number) { form.field_ids = form.field_ids.filter(fieldId => fieldId !== id); fieldError.value = '' }
function openPicker() { pickerFieldIds.value = []; pickerOpen.value = true }
function handleCreateField() { pickerOpen.value = false; emit('create-field') }
function togglePickerField(id: number, checked: boolean) { pickerFieldIds.value = checked ? [...new Set([...pickerFieldIds.value, id])] : pickerFieldIds.value.filter(fieldId => fieldId !== id) }
function confirmPicker() { form.field_ids = [...form.field_ids, ...pickerFieldIds.value.filter(fieldId => !form.field_ids.includes(fieldId) && !lockedFieldIds.value.has(fieldId))]; pickerOpen.value = false; fieldError.value = '' }

function addFieldFromApi(id: number) {
  if (!form.field_ids.includes(id)) form.field_ids = [...form.field_ids, id]
  pickerOpen.value = false
  fieldError.value = ''
}

defineExpose({ addFieldFromApi })

function submit() {
  if (props.saving) return
  const name = form.name.trim()
  nameError.value = !name ? '请输入名称' : name.length > 128 ? '名称不能超过128个字符' : ''
  fieldError.value = form.field_ids.length ? '' : '请至少选择一个指标字段'
  if (nameError.value || fieldError.value) { if (nameError.value) document.getElementById('metric-type-name')?.focus(); return }
  emit('confirm', { ...(props.initialValue?.id ? { id: props.initialValue.id } : {}), name, field_ids: form.field_ids.slice() })
}
watch(() => props.modelValue, async value => {
  if (!value) return
  form.name = props.mode === 'edit' ? props.initialValue?.name || '' : ''
  form.field_ids = props.mode === 'edit' ? props.initialValue?.field_ids?.slice() || [] : props.fieldOptions.map(field => field.id)
  pickerOpen.value = false; pickerFieldIds.value = []; nameError.value = ''; fieldError.value = ''; notice.value = ''
  await nextTick(); document.getElementById('metric-type-name')?.focus()
}, { immediate: true })
watch(() => props.fieldOptions, value => { if (props.modelValue && props.mode === 'create' && !form.field_ids.length) form.field_ids = value.map(field => field.id) }, { deep: true })
watch(() => props.initialValue, value => { if (!props.modelValue || props.mode !== 'edit' || !value) return; form.name = value.name; form.field_ids = value.field_ids.slice() }, { deep: true })
</script>

<style scoped>
#metric-type-create-form { margin: 0; }
.metric-type-field-description { color: var(--color-text-placeholder); font-size: var(--font-size-md); font-weight: 400; line-height: var(--performance-input-line-height); }
.metric-type-fields { min-width: 0; }
.metric-type-fields__locked { display: flex; flex-direction: column; }
.metric-type-fields__picker { position: relative; margin-top: var(--spacing-2); }
.metric-type-fields__picker :deep(.text-button) { margin-top: 0; }
.metric-type-field-picker-layer { position: fixed; z-index: calc(var(--performance-confirm-z-index) + 1); inset: 0; display: grid; place-items: center; padding: var(--spacing-4); box-sizing: border-box; }
.metric-type-field-picker { position: relative; display: flex; width: 280px; padding: 0 0 var(--spacing-4) var(--spacing-5); box-sizing: border-box; flex-direction: column; border-radius: var(--radius-lg); background: var(--color-bg-card); box-shadow: var(--shadow-popover); color: var(--color-text-primary); }
.metric-type-field-picker__list { display: flex; max-height: 240px; flex-direction: column; gap: var(--spacing-2); overflow: auto; padding: var(--spacing-5) var(--spacing-4) 0 0; }
.metric-type-field-picker__list :deep(.performance-checkbox) { width: 100%; margin: 0; }
.metric-type-field-picker__label { display: inline-flex; align-items: center; gap: var(--spacing-2); color: var(--color-text-primary); }
.metric-type-field-picker__label :deep(.performance-metric-field-icon) { flex: 0 0 14px; }
.metric-type-field-picker__create { align-self: flex-start; margin: var(--spacing-2) 0 0 -4px; }
.metric-type-field-picker__footer { display: flex; justify-content: flex-end; gap: var(--spacing-3); padding: var(--spacing-3) var(--spacing-6) 0 0; }
.metric-type-fields__empty { display: block; color: var(--color-text-placeholder); font-size: var(--font-size-sm); line-height: var(--performance-input-line-height); }
.metric-type-footer { display: flex; justify-content: flex-end; gap: var(--spacing-3); }
.metric-type-notice, .metric-type-error { margin: var(--spacing-2) 0 0; font-size: var(--font-size-sm); line-height: var(--performance-input-line-height); }
.metric-type-notice { color: var(--color-text-secondary); }
.metric-type-error { color: var(--performance-field-error-color); }
</style>
