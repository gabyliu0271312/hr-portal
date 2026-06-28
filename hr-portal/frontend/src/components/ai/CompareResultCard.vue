<template>
  <div class="compare-result-card">
    <!-- 结论横幅 -->
    <div class="conclusion-banner" :class="statusClass">
      <div class="conclusion-icon">{{ statusIcon }}</div>
      <div class="conclusion-main">
        <div class="conclusion-title">{{ panelTitle }}</div>
        <div class="conclusion-text">{{ panelSubtitle || readableConclusion }}</div>
      </div>
    </div>

    <!-- 对比上下文 -->
    <div v-if="showContext" class="context-panel">
      <div class="context-item">
        <span class="context-label">对比类型</span>
        <span class="context-value">{{ compareTypeLabel }}</span>
      </div>
      <div class="context-item source-item">
        <span class="context-label">来源 A</span>
        <span class="context-value">{{ result.table_a }}</span>
      </div>
      <div class="context-item source-item">
        <span class="context-label">来源 B</span>
        <span class="context-value">{{ result.table_b }}</span>
      </div>
      <div class="context-item">
        <span class="context-label">对比期间</span>
        <span class="context-value">{{ periodText }}</span>
      </div>
      <div v-if="result.duration_ms != null" class="context-item">
        <span class="context-label">执行耗时</span>
        <span class="context-value">{{ result.duration_ms }}ms</span>
      </div>
    </div>

    <!-- 汇总统计 -->
    <div class="summary-row">
      <div class="stat-item total" :class="{ primary: isPrimaryMetric('total_compared') }">
        <span class="stat-value">{{ result.summary.total_compared }}</span>
        <span class="stat-label">对比总数</span>
        <span class="stat-help">参与匹配的记录数</span>
      </div>
      <div class="stat-item matched" :class="{ primary: isPrimaryMetric('matched_count') }">
        <span class="stat-value">{{ result.summary.matched_count }}</span>
        <span class="stat-label">一致</span>
        <span class="stat-help">两边均存在且一致</span>
      </div>
      <div class="stat-item diff" :class="{ primary: isPrimaryMetric('diff_count') }">
        <span class="stat-value">{{ result.summary.diff_count }}</span>
        <span class="stat-label">差异</span>
        <span class="stat-help">需关注的异常数</span>
      </div>
      <div v-if="result.compare_type === 'roster'" class="stat-item only-a" :class="{ primary: isPrimaryMetric('only_in_a_count') }">
        <span class="stat-value">{{ result.summary.only_in_a_count }}</span>
        <span class="stat-label">仅 A 有</span>
        <span class="stat-help">B 中缺失</span>
      </div>
      <div v-if="result.compare_type === 'roster'" class="stat-item only-b" :class="{ primary: isPrimaryMetric('only_in_b_count') }">
        <span class="stat-value">{{ result.summary.only_in_b_count }}</span>
        <span class="stat-label">仅 B 有</span>
        <span class="stat-help">A 中缺失</span>
      </div>
      <div v-if="result.summary.total_amount_a != null" class="stat-item">
        <span class="stat-value">¥{{ fmtNum(result.summary.total_amount_a) }}</span>
        <span class="stat-label">A 金额</span>
        <span class="stat-help">{{ result.table_a }}</span>
      </div>
      <div v-if="result.summary.total_amount_b != null" class="stat-item">
        <span class="stat-value">¥{{ fmtNum(result.summary.total_amount_b) }}</span>
        <span class="stat-label">B 金额</span>
        <span class="stat-help">{{ result.table_b }}</span>
      </div>
      <div v-if="result.summary.amount_diff != null" class="stat-item" :class="{ 'amount-diff': Math.abs(result.summary.amount_diff) > 0, primary: isPrimaryMetric('amount_diff') }">
        <span class="stat-value" :style="{ color: Math.abs(result.summary.amount_diff) > 0 ? 'var(--color-danger)' : '' }">
          {{ result.summary.amount_diff > 0 ? '+' : '' }}¥{{ fmtNum(result.summary.amount_diff) }}
        </span>
        <span class="stat-label">差额</span>
        <span class="stat-help">A - B</span>
      </div>
    </div>

    <div v-if="showExplanation && result.compare_type === 'roster' && hasRosterDiff" class="diff-explain">
      <div class="explain-title">名单差异说明</div>
      <div class="explain-list">
        <span v-if="result.summary.only_in_a_count > 0">
          <b>仅 A 有</b>：员工存在于 <b>{{ result.table_a }}</b>，但不存在于 <b>{{ result.table_b }}</b>。
        </span>
        <span v-if="result.summary.only_in_b_count > 0">
          <b>仅 B 有</b>：员工存在于 <b>{{ result.table_b }}</b>，但不存在于 <b>{{ result.table_a }}</b>。
        </span>
      </div>
    </div>

    <!-- 差异明细表 -->
    <div v-if="result.details && result.details.length > 0" class="details-section">
      <div class="details-header">
        <div>
          <h4>差异明细</h4>
          <p>当前展示 {{ sortedDetails.length }} 条；差异总数 {{ result.summary.diff_count }} 条。</p>
        </div>
      </div>
      <div class="detail-table-wrap">
        <table class="detail-table">
          <thead>
            <tr>
              <th v-for="col in detailColumns" :key="col" :class="{ highlighted: isHighlightedColumn(col) }">{{ columnLabel(col) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in sortedDetails" :key="idx">
              <td v-for="col in detailColumns" :key="col" :class="{ highlighted: isHighlightedColumn(col) }">
                <span v-if="col === 'diff_type' || col === 'status'"
                  :class="{ 'tag-only-a': isOnlyA(row), 'tag-only-b': isOnlyB(row), 'tag-diff': isDiff(row) }"
                  class="status-tag"
                >
                  {{ formatDiffType(row[col]) }}
                </span>
                <span v-else>{{ row[col] }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else class="no-detail">
      <span class="no-detail-icon">✅</span>
      <span>未发现差异，A/B 两侧数据一致。</span>
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

const statusIcon = computed(() => {
  if (props.result.status === 'consistent') return '✓'
  if (props.result.status === 'significant_diff') return '!'
  return '!'
})

const fallbackStatusTitle = computed(() => {
  if (props.result.status === 'consistent') return '对比一致'
  if (props.result.status === 'significant_diff') return '发现显著差异'
  return '发现差异'
})

const displayConfig = computed(() => props.result.display || null)

const effectiveTemplate = computed(() => {
  const template = displayConfig.value?.template
  if (template && template !== 'auto') return template
  return props.result.compare_type
})

const panelTitle = computed(() => displayConfig.value?.title || fallbackStatusTitle.value)
const panelSubtitle = computed(() => displayConfig.value?.subtitle || '')
const showContext = computed(() => displayConfig.value?.show_context !== false)
const showExplanation = computed(() => displayConfig.value?.show_explanation !== false)

const compareTypeLabel = computed(() => {
  const map: Record<string, string> = {
    roster: '名单对比',
    field: '字段对比',
    amount: '金额对比',
  }
  return map[props.result.compare_type] || props.result.compare_type
})

const periodText = computed(() => {
  const a = props.result.period_a
  const b = props.result.period_b
  if (a && b && a !== b) return `A：${a}；B：${b}`
  return a || b || '未指定'
})

const hasRosterDiff = computed(() => (
  props.result.summary.only_in_a_count > 0 || props.result.summary.only_in_b_count > 0
))

const readableConclusion = computed(() => {
  if (props.result.conclusion) return props.result.conclusion
  if (props.result.status === 'consistent') {
    return `${props.result.table_a} 与 ${props.result.table_b} 数据一致。`
  }
  return `${props.result.table_a} 与 ${props.result.table_b} 存在 ${props.result.summary.diff_count} 条差异，请查看下方明细。`
})

const detailRows = computed(() => props.result.details || [])

const templatePreferredColumns = computed(() => {
  const template = effectiveTemplate.value
  if (template === 'amount') return ['employee_no', 'employee_name', 'amount_a', 'amount_b', 'diff', 'status']
  if (template === 'field') return ['employee_no', 'employee_name', 'field', 'field_a', 'field_b', 'diff_type', 'status']
  return ['employee_no', 'employee_name', 'diff_type', 'status']
})

const detailColumns = computed(() => {
  if (detailRows.value.length === 0) return []
  const keySet = new Set<string>()
  detailRows.value.forEach((row) => Object.keys(row || {}).forEach((key) => keySet.add(key)))
  const keys = Array.from(keySet)
  const hidden = new Set(displayConfig.value?.hidden_columns || [])
  const configured = (displayConfig.value?.columns || []).filter((key) => keySet.has(key) && !hidden.has(key))
  const preferred = (configured.length > 0 ? configured : templatePreferredColumns.value)
    .filter((key) => keySet.has(key) && !hidden.has(key))
  return [
    ...preferred,
    ...keys.filter((key) => !preferred.includes(key) && !hidden.has(key)),
  ]
})

const sortedDetails = computed(() => {
  const rows = [...detailRows.value]
  const sortBy = displayConfig.value?.sort_by
  if (!sortBy || rows.length === 0 || !Object.prototype.hasOwnProperty.call(rows[0], sortBy)) return rows
  const direction = displayConfig.value?.sort_order === 'asc' ? 1 : -1
  return rows.sort((a, b) => compareValues(a[sortBy], b[sortBy]) * direction)
})

function compareValues(a: unknown, b: unknown): number {
  const an = Number(a)
  const bn = Number(b)
  if (!Number.isNaN(an) && !Number.isNaN(bn)) return an === bn ? 0 : an > bn ? 1 : -1
  return String(a ?? '').localeCompare(String(b ?? ''), 'zh-CN')
}

function isHighlightedColumn(col: string): boolean {
  return Boolean(displayConfig.value?.highlight_columns?.includes(col))
}

function isPrimaryMetric(metric: string): boolean {
  return displayConfig.value?.primary_metric === metric
}
function fmtNum(n: number | null | undefined): string {
  if (n == null) return '0'
  return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function columnLabel(col: string): string {
  const map: Record<string, string> = {
    employee_no: '员工编号',
    employee_name: '员工姓名',
    name: '姓名',
    diff_type: '差异类型',
    status: '状态',
    amount_a: 'A 金额',
    amount_b: 'B 金额',
    diff: '差额',
    field: '字段',
    field_a: 'A 字段值',
    field_b: 'B 字段值',
  }
  if (map[col]) return map[col]
  if (col.endsWith('_a')) return `${col.slice(0, -2)}（A）`
  if (col.endsWith('_b')) return `${col.slice(0, -2)}（B）`
  return col
}

function formatDiffType(value: unknown): string {
  const text = String(value ?? '')
  if (!text) return '-'
  if (isOnlyA({ diff_type: text })) return `仅 A 有（B 缺失）`
  if (isOnlyB({ diff_type: text })) return `仅 B 有（A 缺失）`
  return text
}

function isOnlyA(row: Record<string, any>) {
  const v = row.diff_type || row.status || ''
  return (v.includes('仅存在于') && !v.includes('B表')) || v.includes('only_in_a')
}

function isOnlyB(row: Record<string, any>) {
  const v = row.diff_type || row.status || ''
  return (v.includes('仅存在于') && v.includes('B表')) || v.includes('only_in_b')
}

function isDiff(row: Record<string, any>) {
  const v = row.diff_type || row.status || ''
  return v.includes('不一致') || v.includes('差异')
}
</script>

<style scoped>
.compare-result-card {
  font-size: 14px;
  color: var(--color-text-primary);
}

.conclusion-banner {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 14px 16px;
  border-radius: 10px;
  margin-bottom: 16px;
}

.conclusion-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-weight: 800;
  line-height: 1;
  flex-shrink: 0;
}

.conclusion-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 4px;
}

.conclusion-text {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.6;
}

.conclusion-banner.consistent {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}

.conclusion-banner.consistent .conclusion-icon {
  background: #10b981;
  color: #fff;
}

.conclusion-banner.partial {
  background: #fffbeb;
  color: #b45309;
  border: 1px solid #fde68a;
}

.conclusion-banner.partial .conclusion-icon {
  background: #f59e0b;
  color: #fff;
}

.conclusion-banner.significant {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.conclusion-banner.significant .conclusion-icon {
  background: #ef4444;
  color: #fff;
}

.context-panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  padding: 12px;
  margin-bottom: 16px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}

.context-item {
  min-width: 0;
}

.context-label {
  display: block;
  color: var(--color-text-secondary);
  font-size: 12px;
  margin-bottom: 4px;
}

.context-value {
  display: block;
  color: var(--color-text-primary);
  font-weight: 600;
  word-break: break-all;
}

.source-item .context-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
}

.summary-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.stat-item {
  min-width: 0;
  padding: 12px 10px;
  text-align: left;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}

.stat-value {
  display: block;
  font-size: 22px;
  font-weight: 800;
  color: var(--color-text-primary);
  line-height: 1.1;
}

.stat-label {
  display: block;
  font-size: 13px;
  color: var(--color-text-primary);
  font-weight: 600;
  margin-top: 6px;
}

.stat-help {
  display: block;
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-item.matched .stat-value {
  color: #059669;
}

.stat-item.diff .stat-value {
  color: var(--color-danger, #f04438);
}

.stat-item.only-a .stat-value {
  color: #d97706;
}

.stat-item.only-b .stat-value {
  color: #2563eb;
}

.amount-diff .stat-value {
  font-size: 18px;
}

.diff-explain {
  padding: 12px 14px;
  margin-bottom: 16px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 10px;
  color: #9a3412;
}

.explain-title {
  font-weight: 700;
  margin-bottom: 6px;
}

.explain-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  line-height: 1.6;
  font-size: 13px;
}

.details-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 8px;
}

.details-section h4 {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-primary);
}

.details-section p {
  margin: 4px 0 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
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
  padding: 10px 12px;
  text-align: left;
  font-weight: 600;
  border-bottom: 2px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 1;
}

.detail-table td {
  padding: 9px 12px;
  border-bottom: 1px solid var(--color-border-light);
  vertical-align: top;
}

.detail-table tbody tr:hover {
  background: #f9fafb;
}

.status-tag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
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
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  padding: 24px;
  color: #047857;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  font-weight: 600;
}

.no-detail-icon {
  font-size: 18px;
}

.stat-item.primary {
  border-color: #f59e0b;
  background: linear-gradient(180deg, #fff7ed 0%, #fff 100%);
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.12);
}

.detail-table th.highlighted {
  background: #fff7ed;
  color: #9a3412;
}

.detail-table td.highlighted {
  background: #fffbeb;
  font-weight: 600;
}</style>
