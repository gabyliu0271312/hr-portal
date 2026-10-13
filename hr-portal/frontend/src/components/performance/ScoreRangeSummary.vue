<script setup lang="ts">
const props = defineProps<{
  minimum: unknown
  maximum: unknown
  precision: unknown
}>()

function display(value: unknown): string {
  return value === undefined || value === null || value === '' ? '—' : String(value)
}
</script>

<template>
  <div class="score-range-summary-component" data-component="score-range-summary" aria-label="评分上下限">
    <div class="config-field-label">评分上下限</div>
    <div class="score-range-summary" aria-label="评分上下限摘要">
      <span>{{ display(props.minimum) }}</span>
      <span class="range-dash">-</span>
      <span>{{ display(props.maximum) }}</span>
      <span>，{{ display(props.precision) }}</span>
    </div>
  </div>
</template>

<style scoped>
.score-range-summary-component { width: 100%; min-width: 0; }
.config-field-label { height: 22px; margin-bottom: 8px; color: #1f2329; font-size: 14px; font-weight: 600; line-height: 22px; }
.score-range-summary { display: flex; align-items: center; min-height: 32px; gap: 16px; color: #1f2329; font-size: 14px; line-height: 22px; white-space: nowrap; }
</style>
