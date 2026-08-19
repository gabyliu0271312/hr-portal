<template>
  <div class="workflow-executor-field">
    <div class="form-row executor-row" :class="{ 'executor-row--with-sub-options': modelValue === '实线上级' }">
      <div class="form-label"><span class="font-medium">{{ label }}</span><span v-if="required" class="required-mark">*</span></div>
      <div class="select-wrap">
        <PerformanceExecutorSelect
          :model-value="modelValue"
          :options="options"
          :disabled="modeDisabled"
          @update:model-value="$emit('update:modelValue', $event)"
        />
      </div>
    </div>
    <div v-if="modelValue === '实线上级'" class="sub-options">
      <PerformanceCheckbox
        v-for="option in managerLevelOptions"
        :key="option.type"
        class="check-row"
        :model-value="executorTypes.includes(option.type)"
        :label="option.label"
        :disabled="typesDisabled"
        @update:model-value="toggleManagerLevel(option.type, $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceExecutorSelect from './PerformanceExecutorSelect.vue'
import type { PerformanceExecutorOption } from './performanceExecutorOptions'

const props = withDefaults(defineProps<{
  modelValue: string
  executorTypes: string[]
  options: readonly PerformanceExecutorOption[]
  managerLevelOptions: readonly PerformanceExecutorOption[]
  label?: string
  required?: boolean
  modeDisabled?: boolean
  typesDisabled?: boolean
}>(), {
  label: '环节执行人',
  required: true,
  modeDisabled: false,
  typesDisabled: false,
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'update:executorTypes', value: string[]): void
}>()

function toggleManagerLevel(type: string, checked: boolean) {
  const next = checked
    ? [...new Set([...props.executorTypes, type])]
    : props.executorTypes.filter((value) => value !== type)
  emit('update:executorTypes', next)
}
</script>

<style scoped>
.workflow-executor-field{width:100%;min-width:0;box-sizing:border-box}.form-row{display:flex;flex-direction:column;align-items:stretch;gap:8px;width:100%;margin:0 0 20px;box-sizing:border-box}.executor-row{margin-bottom:20px}.executor-row--with-sub-options{margin-bottom:8px}.form-label{display:flex;align-items:baseline;height:22px;color:rgba(0,0,0,.85);font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif}.font-medium{font-weight:600}.required-mark{display:flex;align-items:center;margin-left:2px;color:#f54a45;font:400 14px/22px SimSun,sans-serif}.select-wrap{width:263.333px;max-width:100%;margin:0}.sub-options{display:flex;flex-direction:column;gap:8px;width:263.333px;margin:0 0 20px;padding:12px;box-sizing:border-box;border-radius:6px;background:#f8f9fa}.check-row{width:100%}
</style>
