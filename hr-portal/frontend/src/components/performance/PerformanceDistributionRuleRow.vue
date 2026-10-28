<script setup lang="ts">
import PerformanceIconButton from './PerformanceIconButton.vue'
import PerformanceNumberInput from './PerformanceNumberInput.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import type { PerformanceDistributionCondition } from '@/api/performance'

const props = defineProps<{
  modelValue: PerformanceDistributionCondition
  gradeOptions: Array<{ value: string; label: string }>
  removable?: boolean
  invalid?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: PerformanceDistributionCondition]; remove: [] }>()

const controlOptions = [{ value: 'HARD', label: '强制' }, { value: 'SOFT', label: '建议' }]
const operatorOptions = [
  { value: 'EQ', label: '等于' },
  { value: 'LT', label: '小于' },
  { value: 'LTE', label: '小于等于' },
  { value: 'GT', label: '大于' },
  { value: 'GTE', label: '大于等于' },
]
const unitOptions = [{ value: 'PERCENT', label: '%' }, { value: 'PEOPLE', label: '人' }]

function update(patch: Partial<PerformanceDistributionCondition>) {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}
function single(value: string | string[] | null) { return typeof value === 'string' ? value : '' }
function multiple(value: string | string[] | null) { return Array.isArray(value) ? value : [] }
</script>

<template>
  <div class="distribution-rule-row" :class="{ 'is-invalid': invalid }">
    <PerformanceSearchSelect :model-value="modelValue.control_mode" :options="controlOptions" selection-style="plain" aria-label="分布控制方式" @update:model-value="update({ control_mode: single($event) as PerformanceDistributionCondition['control_mode'] })" />
    <PerformanceSearchSelect :model-value="modelValue.grade_codes" :options="gradeOptions" multiple aria-label="分布等级" placeholder="请选择等级" @update:model-value="update({ grade_codes: multiple($event) })" />
    <PerformanceSearchSelect :model-value="modelValue.operator" :options="operatorOptions" selection-style="plain" aria-label="分布比较符" @update:model-value="update({ operator: single($event) as PerformanceDistributionCondition['operator'] })" />
    <PerformanceNumberInput :model-value="String(modelValue.value || '')" width="90px" :min="0" :max="modelValue.unit === 'PERCENT' ? 100 : undefined" :show-controls="false" aria-label="分布数值" @update:model-value="update({ value: Number($event) || 0 })" />
    <PerformanceSearchSelect class="distribution-rule-row__unit" :model-value="modelValue.unit" :options="unitOptions" selection-style="plain" aria-label="分布单位" @update:model-value="update({ unit: single($event) as PerformanceDistributionCondition['unit'] })" />
    <PerformanceIconButton icon="DeleteTrashOutlined" label="删除分布条件" :disabled="!removable" @click="emit('remove')" />
  </div>
</template>

<style scoped>
.distribution-rule-row{display:grid;grid-template-columns:85px minmax(150px,1fr) 120px 90px 72px 24px;align-items:start;gap:var(--spacing-2)}
.distribution-rule-row.is-invalid :deep(.performance-select-shell__selector),.distribution-rule-row.is-invalid :deep(.performance-number-input){border-color:var(--performance-field-border-invalid)}
.distribution-rule-row__unit{min-width:0}
.distribution-rule-row :deep(.performance-icon-button){--performance-icon-button-size:24px;margin-top:4px}
@media(max-width:720px){.distribution-rule-row{min-width:590px}}
</style>
