<template>
  <div class="performance-departure-date-select">
    <PerformanceDateTimeField v-bind="$attrs" :model-value="modelValue" date-only :initial-date="range?.min || range?.max || undefined" :disabled="disabled" :aria-label="ariaLabel" :placeholder="placeholder" @open="open" @update:model-value="emit('update:modelValue', $event)" />
    <span v-if="loading" role="status" class="snapshot-state">正在加载快照选项…</span>
    <div v-if="error" role="alert" class="snapshot-error">{{ error }}<PerformanceTextButton label="重试" :disabled="disabled" @click="load" /></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PerformanceDateTimeField from './PerformanceDateTimeField.vue'
import PerformanceTextButton from './PerformanceTextButton.vue'
import { usePerformanceSnapshotOptions } from './usePerformanceSnapshotOptions'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{
  modelValue: string
  cycleId?: number | null
  dateRange?: { min: string | null; max: string | null }
  disabled?: boolean
  ariaLabel?: string
  placeholder?: string
}>(), { disabled: false, ariaLabel: '离职日期', placeholder: '请选择日期' })
const emit = defineEmits<{ 'update:modelValue': [value: string]; open: [] }>()
const { options, loading, error, load } = usePerformanceSnapshotOptions(props, () => props.dateRange !== undefined)
const range = computed(() => props.dateRange ?? options.value?.departure_date_range)
function open() {
  if (props.disabled) return
  emit('open')
  void load()
}
</script>

<style scoped>
.performance-departure-date-select{min-width:0}.snapshot-state{color:var(--color-text-secondary);font-size:var(--font-size-sm)}.snapshot-error{color:var(--performance-field-error-color);font-size:var(--performance-field-error-font-size)}
</style>
