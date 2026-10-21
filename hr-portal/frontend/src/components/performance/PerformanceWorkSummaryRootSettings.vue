<script setup lang="ts">
import PerformanceCheckbox from './PerformanceCheckbox.vue'

export interface WorkSummaryRootSettings {
  hideDescription: boolean
  allowMultiple: boolean
  allowUnknown?: boolean
}

const props = withDefaults(defineProps<{ modelValue: WorkSummaryRootSettings; allowMultipleEnabled?: boolean; allowUnknownEnabled?: boolean }>(), { allowMultipleEnabled: true, allowUnknownEnabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: WorkSummaryRootSettings] }>()

function update(patch: Partial<WorkSummaryRootSettings>) {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}
</script>

<template>
  <div class="work-summary-root-settings" aria-label="工作总结整体设置">
    <fieldset class="work-summary-setting-group">
      <legend>显示设置</legend>
      <PerformanceCheckbox :model-value="modelValue.hideDescription" label="隐藏描述" checked-color="#336df4" @update:model-value="update({ hideDescription: $event })" />
    </fieldset>
    <fieldset v-if="allowMultipleEnabled" class="work-summary-setting-group">
      <legend>填写设置</legend>
      <PerformanceCheckbox :model-value="modelValue.allowMultiple" label="允许添加多个" checked-color="#336df4" @update:model-value="update({ allowMultiple: $event })" />
    </fieldset>
    <fieldset v-if="allowUnknownEnabled" class="work-summary-setting-group">
      <legend>评估设置</legend>
      <PerformanceCheckbox :model-value="modelValue.allowUnknown === true" label="评估时允许选择「不了解」" @update:model-value="update({ allowUnknown: $event })" />
      <span class="rating-unknown-description">开启后，若评估人选择「不了解」，则会跳过该评估内容中的所有问题。</span>
    </fieldset>
  </div>
</template>

<style scoped>
.work-summary-root-settings{display:flex;flex-direction:column;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}.work-summary-setting-group{display:flex;flex-direction:column;width:272px;margin:0;padding:0;border:0}.work-summary-setting-group+ .work-summary-setting-group{margin-top:26px}.work-summary-setting-group legend{width:272px;height:22px;margin:0 0 8px;padding:0;color:#1f2329;font-size:14px;font-weight:600;line-height:22px}.work-summary-setting-group :deep(.performance-checkbox){width:auto}
.rating-unknown-description{margin-top:var(--spacing-1);margin-left:calc(var(--performance-checkbox-size) + var(--spacing-2));color:var(--performance-settings-text-secondary);font:400 var(--font-size-md)/var(--performance-input-line-height) var(--font-sans)}
</style>
