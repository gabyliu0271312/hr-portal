<script setup lang="ts">
import { computed } from 'vue'
import { itemSettingsCapabilities, type ItemSettingsVariant } from './performanceContentSettingsRules'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
import PerformanceRatingLevelRuleSettings from './PerformanceRatingLevelRuleSettings.vue'

export interface WorkSummaryItemSettings {
  mode: 'fill' | 'hidden' | 'view'
  required: boolean
  hideName?: boolean
  hideDescription?: boolean
  allowView?: boolean
  onlyWhenFilling?: boolean
  levelRulesEnabled?: boolean
}

const props = withDefaults(defineProps<{ modelValue: WorkSummaryItemSettings; variant?: ItemSettingsVariant }>(), {
  variant: 'work-summary',
})
const capabilities = computed(() => itemSettingsCapabilities[props.variant])
const emit = defineEmits<{ 'update:modelValue': [value: WorkSummaryItemSettings] }>()
const options = computed(() => [
  { value: 'fill', label: '在此环节填写' },
  { value: 'hidden', label: '在此环节隐藏' },
  ...(capabilities.value.viewResults ? [{ value: 'view', label: '在此环节查看被评估人的填写结果' }] : []),
])
const checkedColor = '#336df4'

function update(patch: Partial<WorkSummaryItemSettings>) {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}
</script>

<template>
  <div class="work-summary-item-settings" :class="{ 'work-summary-item-settings--rating': variant === 'rating' }" :aria-label="variant === 'rating' ? '评分评级设置' : variant === 'custom-text' ? '自定义文本填写题设置' : variant === 'custom-tag' ? '自定义标签填写题设置' : '工作总结填写题设置'">
    <fieldset v-if="capabilities.allowView" class="work-summary-setting-group work-summary-view-setting">
      <PerformanceCheckbox :model-value="modelValue.allowView !== false" label="允许查看" :checked-color="checkedColor" @update:model-value="update({ allowView: $event })" />
      <div v-if="modelValue.allowView !== false && (capabilities.hideName || capabilities.hideDescription || capabilities.onlyWhenFilling)" class="work-summary-view-options">
        <PerformanceCheckbox v-if="capabilities.onlyWhenFilling" :model-value="modelValue.onlyWhenFilling === true" label="仅在填写时显示" :checked-color="checkedColor" @update:model-value="update({ onlyWhenFilling: $event })" />
        <PerformanceCheckbox v-if="capabilities.hideName" :model-value="modelValue.hideName === true" label="隐藏名称" :checked-color="checkedColor" @update:model-value="update({ hideName: $event })" />
        <PerformanceCheckbox v-if="capabilities.hideDescription" :model-value="modelValue.hideDescription === true" label="隐藏描述" :checked-color="checkedColor" @update:model-value="update({ hideDescription: $event })" />
      </div>
    </fieldset>
    <fieldset v-else-if="capabilities.viewResults" class="work-summary-setting-group work-summary-view-setting">
      <legend>填写设置</legend>
      <PerformanceRadioGroup :model-value="modelValue.mode" :options="options" name="work-summary-item-mode" aria-label="填写设置" @update:model-value="update({ mode: $event as WorkSummaryItemSettings['mode'] })" />
    </fieldset>
    <fieldset v-else-if="capabilities.hideName || capabilities.hideDescription" class="work-summary-setting-group">
      <legend>显示设置</legend>
      <PerformanceCheckbox v-if="capabilities.hideName" :model-value="modelValue.hideName === true" label="隐藏名称" :checked-color="checkedColor" @update:model-value="update({ hideName: $event })" />
      <PerformanceCheckbox v-if="capabilities.hideDescription" :model-value="modelValue.hideDescription === true" label="隐藏描述" :checked-color="checkedColor" @update:model-value="update({ hideDescription: $event })" />
    </fieldset>
    <fieldset v-if="capabilities.mode && !capabilities.viewResults" class="work-summary-setting-group">
      <legend>填写设置</legend>
      <PerformanceRadioGroup :model-value="modelValue.mode" :options="options" name="work-summary-item-mode" aria-label="填写设置" @update:model-value="update({ mode: $event as WorkSummaryItemSettings['mode'] })" />
    </fieldset>
    <fieldset v-if="capabilities.required && (!capabilities.mode || modelValue.mode === 'fill')" class="work-summary-setting-group work-summary-required-setting">
      <legend>必填项设置</legend>
      <PerformanceCheckbox :model-value="modelValue.required" label="必填" :checked-color="checkedColor" @update:model-value="update({ required: $event })" />
    </fieldset>
    <PerformanceRatingLevelRuleSettings v-if="capabilities.levelRules" class="work-summary-level-rules" :model-value="modelValue.levelRulesEnabled === true" @update:model-value="update({ levelRulesEnabled: $event })" />
  </div>
</template>

<style scoped>
.work-summary-item-settings{display:flex;flex-direction:column;color:var(--color-text-primary);font:400 var(--font-size-md)/22px var(--font-sans)}.work-summary-setting-group{display:flex;flex-direction:column;width:272px;margin:0;padding:0;border:0}.work-summary-setting-group+ .work-summary-setting-group{margin-top:24px}.work-summary-setting-group legend{width:272px;height:22px;margin:0 0 8px;padding:0;color:var(--color-text-primary);font-size:var(--font-size-md);font-weight:600;line-height:22px}.work-summary-setting-group :deep(.performance-radio-group){display:flex;flex-direction:column;align-items:flex-start;gap:8px!important}.work-summary-setting-group :deep(.performance-checkbox){width:auto}.work-summary-setting-group :deep(.performance-checkbox + .performance-checkbox){margin-top:8px}
.work-summary-view-options{display:flex;flex-direction:column;width:100%;margin-top:var(--spacing-2);padding:var(--spacing-4);box-sizing:border-box;background:var(--performance-review-readonly-surface);border-radius:6px}
.work-summary-level-rules{margin-top:var(--spacing-6)}
</style>