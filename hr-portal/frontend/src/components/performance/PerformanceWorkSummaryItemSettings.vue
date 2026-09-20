<script setup lang="ts">
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'

export interface WorkSummaryItemSettings {
  mode: 'fill' | 'hidden'
  required: boolean
}

const props = defineProps<{ modelValue: WorkSummaryItemSettings }>()
const emit = defineEmits<{ 'update:modelValue': [value: WorkSummaryItemSettings] }>()
const options = [
  { value: 'fill', label: '在此环节填写' },
  { value: 'hidden', label: '在此环节隐藏' },
]

function update(patch: Partial<WorkSummaryItemSettings>) {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}
</script>

<template>
  <div class="work-summary-item-settings" aria-label="工作总结填写题设置">
    <fieldset class="work-summary-setting-group">
      <legend>填写设置</legend>
      <PerformanceRadioGroup :model-value="modelValue.mode" :options="options" name="work-summary-item-mode" aria-label="填写设置" @update:model-value="update({ mode: $event as WorkSummaryItemSettings['mode'] })" />
    </fieldset>
    <fieldset v-if="modelValue.mode === 'fill'" class="work-summary-setting-group work-summary-required-setting">
      <legend>必填项设置</legend>
      <PerformanceCheckbox :model-value="modelValue.required" label="必填" checked-color="#336df4" @update:model-value="update({ required: $event })" />
    </fieldset>
  </div>
</template>

<style scoped>
.work-summary-item-settings{display:flex;flex-direction:column;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}.work-summary-setting-group{display:flex;flex-direction:column;width:272px;margin:0;padding:0;border:0}.work-summary-setting-group+ .work-summary-setting-group{margin-top:24px}.work-summary-setting-group legend{width:272px;height:22px;margin:0 0 8px;padding:0;color:#1f2329;font-size:14px;font-weight:600;line-height:22px}.work-summary-setting-group :deep(.performance-radio-group){display:flex;flex-direction:column;align-items:flex-start;gap:8px!important}.work-summary-setting-group :deep(.performance-checkbox){width:auto}
</style>
