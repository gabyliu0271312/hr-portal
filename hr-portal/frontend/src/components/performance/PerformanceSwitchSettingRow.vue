<template>
  <div class="performance-switch-setting-row">
    <span class="performance-switch-setting-row__label invite-executor-title">{{ label }}</span>
    <PerformanceInfoPopover v-if="info" class="performance-switch-setting-row__info" :content="info" :delay="infoDelay" :icon-color="infoColor" />
    <PerformanceSwitch :model-value="modelValue" :disabled="disabled" :aria-label="label" @update:model-value="$emit('update:modelValue', $event)" />
  </div>
</template>

<script setup lang="ts">
import PerformanceInfoPopover from './PerformanceInfoPopover.vue'
import PerformanceSwitch from './PerformanceSwitch.vue'

withDefaults(defineProps<{
  modelValue: boolean
  label: string
  info?: string | string[]
  infoDelay?: number
  infoColor?: string
  disabled?: boolean
}>(), {
  info: undefined,
  infoDelay: 124,
  infoColor: '#646a73',
  disabled: false,
})
defineEmits<{ (event: 'update:modelValue', value: boolean): void }>()
</script>

<style scoped>
.performance-switch-setting-row{display:flex;align-items:center;width:263.333px;max-width:100%;height:22px;box-sizing:border-box;color:#1f2329;font:400 14px/22.001px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}.performance-switch-setting-row__label{font-weight:600;white-space:nowrap}.performance-switch-setting-row__info{margin-left:4px}.performance-switch-setting-row :deep(.performance-switch){flex:0 0 28px;margin-left:8px}
</style>
