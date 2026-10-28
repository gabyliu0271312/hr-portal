<template>
  <div class="performance-snapshot-field-select">
    <PerformanceSearchSelect v-bind="$attrs" :model-value="modelValue" :options="options ?? loadedOptions" :multiple="multiple" :disabled="disabled" :aria-label="ariaLabel || label" :placeholder="placeholder || `请选择${label}`" :empty-text="loading ? '正在加载快照选项…' : '暂无可选项'" @open="open" @update:model-value="emit('update:modelValue', $event)" />
    <span v-if="loading" role="status" class="snapshot-state">正在加载快照选项…</span>
    <div v-if="error" role="alert" class="snapshot-error">{{ error }}<PerformanceTextButton label="重试" :disabled="disabled" @click="load" /></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PerformanceEvaluatorOptions } from '@/api/performance'
import PerformanceSearchSelect, { type PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'
import PerformanceTextButton from './PerformanceTextButton.vue'
import { PERFORMANCE_CONDITION_FIELDS } from './performanceConditionFields'
import { usePerformanceSnapshotOptions } from './usePerformanceSnapshotOptions'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{
  modelValue: string | string[] | null
  field: 'employment_status' | 'job_family' | 'job_category' | 'position_level' | 'standard_position'
  cycleId?: number | null
  options?: PerformanceSearchSelectOption[]
  multiple?: boolean
  disabled?: boolean
  ariaLabel?: string
  placeholder?: string
}>(), { multiple: true, disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: string | string[] | null]; open: [] }>()
const { options: snapshot, loading, error, load } = usePerformanceSnapshotOptions(props, () => props.options !== undefined)
const label = computed(() => PERFORMANCE_CONDITION_FIELDS[props.field].label)
const loadedOptions = computed(() => (snapshot.value?.[PERFORMANCE_CONDITION_FIELDS[props.field].valueSource as keyof PerformanceEvaluatorOptions] || []) as PerformanceSearchSelectOption[])
function open() {
  if (props.disabled) return
  emit('open')
  void load()
}
</script>

<style scoped>
.performance-snapshot-field-select{min-width:0}.snapshot-state{color:var(--color-text-secondary);font-size:var(--font-size-sm)}.snapshot-error{color:var(--performance-field-error-color);font-size:var(--performance-field-error-font-size)}
</style>
