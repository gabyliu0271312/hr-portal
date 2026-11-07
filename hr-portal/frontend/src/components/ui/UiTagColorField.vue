<script setup lang="ts">
import ColorPicker from '@/components/performance/ColorPicker.vue'
import PerformanceFormItem from '@/components/performance/PerformanceFormItem.vue'
import { PERFORMANCE_GROUP_TAG_COLORS } from '@/components/performance/performanceColorOptions'

defineProps<{ modelValue: string; textColor: string; bgColor: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <PerformanceFormItem label="标签颜色" class="ui-tag-color-field">
    <div class="ui-tag-color-field__control">
      <ColorPicker :model-value="modelValue" :options="PERFORMANCE_GROUP_TAG_COLORS" label="标签颜色" @update:model-value="emit('update:modelValue', $event)" />
      <span class="ui-tag-color-field__preview" :style="{ color: textColor, backgroundColor: bgColor }">标签</span>
    </div>
  </PerformanceFormItem>
</template>

<style scoped>
.ui-tag-color-field { margin-top: var(--spacing-4); }
.ui-tag-color-field__control { display: flex; align-items: center; height: var(--ui-tag-color-control-height); gap: var(--spacing-2); --color-picker-trigger-margin-top: 0; }
.ui-tag-color-field__preview { display: inline-flex; align-items: center; justify-content: center; width: var(--ui-tag-color-preview-width); height: var(--ui-tag-color-control-height); border-radius: var(--radius-sm); font-size: var(--font-size-md); line-height: var(--performance-input-line-height); }
</style>
