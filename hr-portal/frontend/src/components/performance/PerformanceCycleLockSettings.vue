<script setup lang="ts">
import type { PerformanceCycleLockRule, PerformanceCycleSyncMode } from '../../api/performance'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
import PerformanceDateTimeField from './PerformanceDateTimeField.vue'
import PerformanceInfoPopover from './PerformanceInfoPopover.vue'
import UiOptionDetail from '../ui/UiOptionDetail.vue'

withDefaults(defineProps<{
  lockRule: PerformanceCycleLockRule
  lockAt: string
  syncMode: PerformanceCycleSyncMode
  adjustUntil: string
  disabled?: boolean
  errors: Record<string, string>
  lockError: string
  deadlineError: string
}>(), { disabled: false })
const emit = defineEmits<{
  'update:lockRule': [value: PerformanceCycleLockRule]
  'update:lockAt': [value: string]
  'update:syncMode': [value: PerformanceCycleSyncMode]
  'update:adjustUntil': [value: string]
}>()
const lockOptions = [
  { value: 'IMMEDIATE', label: '新建周期时，立即锁定' },
  { value: 'SCHEDULED', label: '新建周期并到达指定时间后，再锁定' },
]
const syncOptions = [
  { value: 'MANUAL', label: '不自动变化，由项目管理员手动调整' },
  { value: 'AUTO_DAILY', label: '指定时间前，系统每天定时自动调整' },
]
</script>

<template>
  <div class="cycle-lock-settings">
    <PerformanceFormItem label="锁定规则" required>
      <template #description><span class="cycle-lock-settings__description">配置锁定规则和时间后，各项目人员汇报线和组织关系信息将以锁定时的信息为准。在绩效环节开始前，管理员仍可更新锁定的人员和部门信息。</span></template>
      <PerformanceRadioGroup class="lock-rule-options" :model-value="lockRule" :options="lockOptions" name="cycle-lock-rule" direction="vertical" gap="var(--spacing-2)" :disabled="disabled" aria-label="锁定规则" @update:model-value="emit('update:lockRule', $event as PerformanceCycleLockRule)" />
    </PerformanceFormItem>
    <UiOptionDetail v-if="lockRule === 'SCHEDULED'" class="lock-settings-card">
      <PerformanceFormItem label="锁定时间" input-id="lock-at" required :invalid="Boolean(errors['lock-at'] || lockError)" :error-message="errors['lock-at'] || lockError" :error-id="errors['lock-at'] ? 'lock-at-error' : 'lock-at-rule-error'">
        <template #description><span class="cycle-lock-settings__description">系统将在此时间开始锁定。人员和部门信息的数量越多，锁定过程持续的时间越长。</span></template>
        <PerformanceDateTimeField :model-value="lockAt" input-id="lock-at" aria-label="周期锁定时间" :disabled="disabled" :required="!disabled" :invalid="Boolean(errors['lock-at'] || lockError)" :described-by="errors['lock-at'] ? 'lock-at-error' : lockError ? 'lock-at-rule-error' : ''" @update:model-value="emit('update:lockAt', $event)" />
      </PerformanceFormItem>
      <PerformanceFormItem class="sync-field" label="锁定时间前，已启动项目的「被评估人名单」是否跟随人员和部门信息变化" required>
        <PerformanceRadioGroup :model-value="syncMode" :options="syncOptions" name="cycle-pre-lock-sync" direction="vertical" gap="var(--spacing-2)" :disabled="disabled" aria-label="被评估人名单自动调整方式" @update:model-value="emit('update:syncMode', $event as PerformanceCycleSyncMode)" />
      </PerformanceFormItem>
      <PerformanceFormItem v-if="syncMode === 'AUTO_DAILY'" class="cycle-lock-settings__deadline" label="截止时间" input-id="adjust-until" required :invalid="Boolean(errors['adjust-until'] || deadlineError)" :error-message="errors['adjust-until'] || deadlineError" error-id="adjust-until-error">
        <template #label-extra><PerformanceInfoPopover content="截止时间前，系统每天按项目条件调整被评估人名单；截止后停止自动增删。截止时间不能晚于锁定时间。" aria-label="自动调整截止时间说明" /></template>
        <PerformanceDateTimeField :model-value="adjustUntil" input-id="adjust-until" aria-label="自动调整截止时间" :disabled="disabled" :required="!disabled" :invalid="Boolean(errors['adjust-until'] || deadlineError)" :described-by="errors['adjust-until'] || deadlineError ? 'adjust-until-error' : ''" @update:model-value="emit('update:adjustUntil', $event)" />
      </PerformanceFormItem>
    </UiOptionDetail>
  </div>
</template>

<style scoped>
.cycle-lock-settings { margin-top: var(--spacing-5); }
.cycle-lock-settings .lock-settings-card { background: var(--perf-n-100); margin-bottom: 0; }
.cycle-lock-settings .performance-form-item { margin-bottom: var(--spacing-4); }
.cycle-lock-settings .sync-field { margin-bottom: 0; }
.cycle-lock-settings__description { color: var(--performance-text-secondary); font-size: var(--font-size-md); line-height: var(--performance-input-line-height); }
.cycle-lock-settings :deep(.performance-form-item__description) { margin-top: calc(-1 * var(--spacing-1)); }
.cycle-lock-settings :deep(.performance-radio-group) { display: flex; width: 100%; }
.cycle-lock-settings :deep(.performance-radio-entry) { width: 100%; }
.cycle-lock-settings :deep(.performance-radio-option) { flex: 1; min-width: 0; height: auto; min-height: var(--performance-input-line-height); align-items: flex-start; }
.cycle-lock-settings :deep(.radio-wallpaper) { margin-top: calc((var(--performance-input-line-height) - var(--performance-workbench-editor-radio-size)) / 2); }
.cycle-lock-settings :deep(.radio-label) { white-space: normal; overflow-wrap: anywhere; }
.cycle-lock-settings .cycle-lock-settings__deadline { margin: var(--spacing-2) 0 0 var(--ui-option-detail-inset); }
.cycle-lock-settings__deadline :deep(.performance-form-item__label) { font-weight: var(--font-weight-normal); }
</style>
