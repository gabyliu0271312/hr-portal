<template>
  <PerformanceOtherSettingsCard :title="title">
    <p v-if="description" class="toggle-setting-card__description">{{ description }}</p>
    <PerformanceReadOnlySettingRow :checked="checked" :label="label" :disabled="disabled" @update:checked="$emit('update:checked', $event)" />
    <p v-if="helper" class="toggle-setting-card__helper">{{ helper }}</p>
  </PerformanceOtherSettingsCard>
</template>

<script setup lang="ts">
import PerformanceOtherSettingsCard from './PerformanceOtherSettingsCard.vue'
import PerformanceReadOnlySettingRow from './PerformanceReadOnlySettingRow.vue'

defineProps<{ title: string; label: string; checked: boolean; disabled?: boolean; description?: string; helper?: string }>()
defineEmits<{ 'update:checked': [value: boolean] }>()
</script>

<style scoped>
.toggle-setting-card__description { margin: -4px 0 var(--spacing-3); color: var(--performance-settings-text-secondary); font-size: var(--font-size-xs); line-height: 20px; }
.toggle-setting-card__helper { margin: var(--spacing-1) 0 0 24px; color: var(--performance-settings-text-secondary); font-size: var(--font-size-md); line-height: 20px; }
</style>
