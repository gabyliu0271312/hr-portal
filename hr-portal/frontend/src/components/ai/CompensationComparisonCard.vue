<script setup lang="ts">
import { computed } from 'vue'
import type { CompensationComparisonData, CompensationComparisonSnapshot } from '@/api/ai'

const props = defineProps<{
  result: CompensationComparisonData
}>()

function text(value?: string | number | null) {
  return value === null || value === undefined || value === '' ? '--' : String(value)
}

function money(value?: number | null) {
  return value === null || value === undefined
    ? '--'
    : new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function employee(snapshot: CompensationComparisonSnapshot) {
  return snapshot.employee_name || snapshot.employee_no || '--'
}

const delta = computed(() => {
  const previous = props.result.previous.total_amount
  const current = props.result.current.total_amount
  return previous == null || current == null ? null : current - previous
})
</script>

<template>
  <div class="comparison-card">
    <div class="comparison-header">
      <strong>补偿金试算比较</strong>
      <span v-if="delta !== null" :class="delta >= 0 ? 'increase' : 'decrease'">
        差额 {{ delta >= 0 ? '+' : '' }}{{ money(delta) }}
      </span>
    </div>
    <div class="comparison-grid">
      <section>
        <h4>前次试算</h4>
        <p>员工：{{ employee(result.previous) }}</p>
        <p>离职日期：{{ text(result.previous.leave_date) }}</p>
        <p>方案：{{ text(result.previous.plan) }}</p>
        <p class="amount">合计：{{ money(result.previous.total_amount) }}</p>
      </section>
      <section>
        <h4>当前试算</h4>
        <p>员工：{{ employee(result.current) }}</p>
        <p>离职日期：{{ text(result.current.leave_date) }}</p>
        <p>方案：{{ text(result.current.plan) }}</p>
        <p class="amount">合计：{{ money(result.current.total_amount) }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.comparison-card { margin-top: 8px; border: 1px solid var(--color-border-light); border-radius: 8px; padding: 12px; background: var(--color-bg-card); }
.comparison-header { display: flex; justify-content: space-between; gap: 8px; color: var(--color-text-primary); }
.increase { color: var(--color-danger); }
.decrease { color: var(--color-success); }
.comparison-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; }
.comparison-grid section { min-width: 0; padding: 8px; border-radius: 6px; background: var(--color-bg-subtle); }
h4, p { margin: 0; }
h4 { font-size: 13px; margin-bottom: 6px; }
p { font-size: 12px; line-height: 1.7; color: var(--color-text-secondary); }
.amount { font-weight: 600; color: var(--color-text-primary); }
</style>
