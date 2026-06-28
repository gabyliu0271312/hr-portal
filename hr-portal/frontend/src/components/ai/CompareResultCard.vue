<template>
  <div class="compare-result-card">
    <!-- 结论横幅 -->
    <div class="conclusion-banner" :class="statusClass">
      {{ result.conclusion }}
    </div>

    <!-- 汇总统计 -->
    <div class="summary-row">
      <div class="stat-item">
        <span class="stat-value">{{ result.summary.total_compared }}</span>
        <span class="stat-label">对比总数</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ result.summary.matched_count }}</span>
        <span class="stat-label">一致</span>
      </div>
      <div class="stat-item diff">
        <span class="stat-value">{{ result.summary.diff_count }}</span>
        <span class="stat-label">差异</span>
      </div>
      <div v-if="result.compare_type === 'roster'" class="stat-item">
        <span class="stat-value">{{ result.summary.only_in_a_count }}</span>
        <span class="stat-label">仅在A</span>
      </div>
      <div v-if="result.compare_type === 'roster'" class="stat-item">
        <span class="stat-value">{{ result.summary.only_in_b_count }}</span>
        <span class="stat-label">仅在B</span>
      </div>
      <div v-if="result.summary.total_amount_a != null" class="stat-item">
        <span class="stat-value">¥{{ fmtNum(result.summary.total_amount_a) }}</span>
        <span class="stat-label">A表金额</span>
      </div>
      <div v-if="result.summary.total_amount_b != null" class="stat-item">
        <span class="stat-value">¥{{ fmtNum(result.summary.total_amount_b) }}</span>
        <span class="stat-label">B表金额</span>
      </div>
      <div v-if="result.summary.amount_diff != null" class="stat-item" :class="{ 'amount-diff': Math.abs(result.summary.amount_diff) > 0 }">
        <span class="stat-value" :style="{ color: Math.abs(result.summary.amount_diff) > 0 ? 'var(--color-danger)' : '' }">
          {{ result.summary.amount_diff > 0 ? '+' : '' }}¥{{ fmtNum(result.summary.amount_diff) }}
        </span>
        <span class="stat-label">差额</span>
      </div>
    </div>

    <!-- 表信息 -->
    <div class="table-info">
      对比 {{ result.table_a }} ↔ {{ result.table_b }}
      <template v-if="result.period_a">（{{ result.period_a }}）</template>
      <span v-if="result.duration_ms != null" class="duration"> · {{ result.duration_ms }}ms</span>
    </div>

    <!-- 差异明细表 -->
    <div v-if="result.details && result.details.length > 0" class="details-section">
      <h4>差异明细</h4>
      <div class="detail-table-wrap">
        <table class="detail-table">
          <thead>
            <tr>
              <th v-for="col in detailColumns" :key="col">{{ col }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in result.details" :key="idx">
              <td v-for="col in detailColumns" :key="col">
                <span v-if="col === 'diff_type' || col === 'status'"
                  :class="{ 'tag-only-a': isOnlyA(row), 'tag-only-b': isOnlyB(row), 'tag-diff': isDiff(row) }"
                  class="status-tag"
                >
                  {{ row[col] }}
                </span>
                <span v-else>{{ row[col] }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else class="no-detail">
      ✅ 无差异数据
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CompareResult } from '@/api/data-compare'

const props = defineProps<{
  result: CompareResult
}>()

const statusClass = computed(() => {
  if (props.result.status === 'significant_diff') return 'significant'
  if (props.result.status === 'partial_diff') return 'partial'
  return 'consistent'
})

const detailColumns = computed(() => {
  if (!props.result.details || props.result.details.length === 0) return []
  return Object.keys(props.result.details[0] || {})
})

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '0'
  return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function isOnlyA(row: Record<string, any>) {
  const v = row.diff_type || row.status || ''
  return v.includes('仅存在于') && !v.includes('B表')
}

function isOnlyB(row: Record<string, any>) {
  const v = row.diff_type || row.status || ''
  return v.includes('仅存在于') && v.includes('B表')
}

function isDiff(row: Record<string, any>) {
  const v = row.diff_type || row.status || ''
  return v.includes('不一致') || v.includes('差异')
}
</script>

<style scoped>
.compare-result-card {
  font-size: 14px;
}

.conclusion-banner {
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-weight: 600;
  font-size: 15px;
}

.conclusion-banner.consistent {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}

.conclusion-banner.partial {
  background: #fffbeb;
  color: #b45309;
  border: 1px solid #fde68a;
}

.conclusion-banner.significant {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.summary-row {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.stat-item {
  text-align: center;
  min-width: 64px;
}

.stat-value {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.stat-label {
  display: block;
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 2px;
}

.stat-item.diff .stat-value {
  color: var(--color-danger, #f04438);
}

.amount-diff .stat-value {
  font-size: 18px;
}

.table-info {
  color: var(--color-text-secondary);
  font-size: 13px;
  margin-bottom: 16px;
}

.duration {
  color: var(--color-text-secondary);
}

.details-section h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: var(--color-text-primary);
}

.detail-table-wrap {
  max-height: 400px;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: 6px;
}

.detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.detail-table th {
  background: #f9fafb;
  padding: 8px 12px;
  text-align: left;
  font-weight: 600;
  border-bottom: 2px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 1;
}

.detail-table td {
  padding: 6px 12px;
  border-bottom: 1px solid var(--color-border-light);
}

.detail-table tbody tr:hover {
  background: #f9fafb;
}

.status-tag {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.tag-only-a {
  background: #fef3c7;
  color: #92400e;
}

.tag-only-b {
  background: #dbeafe;
  color: #1e40af;
}

.tag-diff {
  background: #fee2e2;
  color: #991b1b;
}

.no-detail {
  text-align: center;
  padding: 20px;
  color: var(--color-text-secondary);
}
</style>
