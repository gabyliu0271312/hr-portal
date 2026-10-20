<template>
  <PerformanceOtherSettingsCard title="360˚ 评估设置">
    <div class="settings-360__section">
      <div class="settings-360__subtitle">360°评估人标签管理</div>
      <p class="settings-360__description">可给360°评估人打标签，以便更好区分不同类型的360°评估人，在周期设置中可进一步配置标签规则。</p>
      <PerformanceReadOnlySettingRow :checked="checked" :disabled="disabled" label="启用 360° 评估人标签" @update:checked="$emit('update:checked', $event)" />
      <div class="settings-360__tags">
        <div class="settings-360__tags-header">
          <span>标签名称</span>
          <PerformanceIconAction icon="settings" label="设置 360° 评估人标签" text="管理标签" @click="$emit('settings')" />
        </div>
        <div class="settings-360__empty">暂无 360° 评估人标签</div>
      </div>
    </div>
  </PerformanceOtherSettingsCard>
</template>

<script setup lang="ts">
import PerformanceIconAction from './PerformanceIconAction.vue'
import PerformanceOtherSettingsCard from './PerformanceOtherSettingsCard.vue'
import PerformanceReadOnlySettingRow from './PerformanceReadOnlySettingRow.vue'

defineProps<{ checked: boolean; disabled?: boolean }>()
defineEmits<{ settings: []; 'update:checked': [value: boolean] }>()
</script>

<style scoped>
.settings-360__subtitle { color: var(--color-text-primary); font-size: var(--font-size-md); font-weight: 600; line-height: 22px; }
.settings-360__description { margin: 0; color: var(--performance-settings-text-secondary); font-size: var(--font-size-md); line-height: 22px; }
.settings-360__section :deep(.readonly-setting-row) { margin-top: var(--spacing-1); }
.settings-360__tags { margin-top: var(--spacing-1); padding: var(--spacing-3) var(--spacing-3) var(--spacing-3) var(--spacing-4); border-radius: var(--radius-lg); background: var(--performance-review-readonly-surface); }
.settings-360__tags-header { display: flex; align-items: center; justify-content: space-between; color: var(--performance-settings-text-secondary); font-size: var(--font-size-md); line-height: 21px; }
.settings-360__empty { margin-top: 10px; color: var(--color-text-primary); font-size: var(--font-size-md); line-height: 21px; }
</style>
