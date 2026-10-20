<template>
  <PerformanceOtherSettingsCard title="授权和转交设置（不含校准）" class="authorization-transfer-card">
    <div class="authorization-transfer-card__heading">提示设置</div>
    <div class="authorization-transfer-card__example">
      <span>可设置前台授权或转交时显示的提示文案</span>
      <PerformancePermissionButton :allowed="true" op="V" class="authorization-transfer-card__example-action" @click="$emit('showExample')">查看示例</PerformancePermissionButton>
    </div>
    <div class="authorization-transfer-card__list">
      <div v-for="item in items" :key="item.key" class="authorization-transfer-card__item">
        <div class="authorization-transfer-card__item-title">{{ item.title }}</div>
        <div class="authorization-transfer-card__item-line">
          <p>{{ item.description }}</p>
          <PerformanceIconAction :label="`编辑${item.title}`" text="编辑" @click="$emit('edit', item.key)" />
        </div>
      </div>
    </div>
  </PerformanceOtherSettingsCard>
</template>

<script setup lang="ts">
import PerformanceIconAction from './PerformanceIconAction.vue'
import PerformanceOtherSettingsCard from './PerformanceOtherSettingsCard.vue'
import PerformancePermissionButton from './PerformancePermissionButton.vue'

const items = [
  { key: 'authorization', title: '授权提示', description: '请确保授权对象有所选环节的操作资格，避免错误授权泄露敏感数据。' },
  { key: 'transfer', title: '转交提示', description: '请确保转交对象有所选环节的操作资格，避免错误授权泄露敏感数据。' },
] as const

defineEmits<{
  showExample: []
  edit: [key: 'authorization' | 'transfer']
}>()
</script>

<style scoped>
.authorization-transfer-card__heading { color: var(--color-text-primary); font-size: var(--font-size-md); font-weight: 600; line-height: 22px; }
.authorization-transfer-card__example { margin-top: 0; margin-bottom: var(--spacing-2); color: var(--performance-settings-text-secondary); line-height: 22px; }
.authorization-transfer-card__example-action { height: 22px; padding: 2px var(--spacing-1); border: 0; line-height: 18px; }
.authorization-transfer-card__list { box-sizing: border-box; padding: 0 var(--spacing-3) 0 var(--spacing-4); border-radius: var(--radius-lg); background: var(--performance-review-readonly-surface); }
.authorization-transfer-card__item { padding: var(--spacing-3) 0; }
.authorization-transfer-card__item + .authorization-transfer-card__item { border-top: 1px solid var(--color-line-divider); }
.authorization-transfer-card__item-title { margin-bottom: var(--spacing-1); color: var(--color-text-primary); font-size: var(--font-size-md); font-weight: 600; line-height: 22px; }
.authorization-transfer-card__item-line { display: flex; align-items: flex-start; gap: 36px; }
.authorization-transfer-card__item-line p { min-width: 0; flex: 1; margin: 0; color: var(--color-text-primary); font-size: var(--font-size-md); line-height: 21px; }
.authorization-transfer-card__item-line :deep(.other-settings-icon-action) { margin-top: -2px; }
@media (max-width: 640px) { .authorization-transfer-card__item-line { gap: 12px; } }
</style>
