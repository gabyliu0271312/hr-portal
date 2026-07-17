<script setup lang="ts">
import type { RunResult } from '@/api/reports'

const props = defineProps<{
  columns: RunResult['columns']
  items: RunResult['items']
  total: number
  page: number
  pageSize: number
  loading?: boolean
  maxHeight?: number
  height?: number | string
  fillViewport?: boolean
  pageSizes?: number[]
}>()

const emit = defineEmits<{
  'update:page': [v: number]
  'update:pageSize': [v: number]
  'page-change': []
}>()

const NUMERIC_TYPES = new Set(['integer', 'number', 'decimal', 'float', 'double', 'numeric'])

/** 纯字符串千分位格式化，避免 IEEE 754 Number 对大值截断 */
function formatDecimal(raw: string): string {
  // 去除可能的前后空格
  const s = raw.trim()
  if (!s) return '0'

  // 分离正负号
  let sign = ''
  let body = s
  if (body[0] === '-') { sign = '-'; body = body.slice(1) }
  else if (body[0] === '+') { body = body.slice(1) }

  // 用正则解析整数部分和小数部分
  const m = body.match(/^(\d+)(?:\.(\d*))?$/)
  if (!m) {
    // 非规范格式（如科学计数法 "1.23e5"）—— 回退到 Number，能处理多少是多少
    const n = Number(s)
    if (!isNaN(n)) return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 6 })
    return s
  }

  let integerPart = m[1]!
  let fractionPart = m[2] || ''

  // 小数部分截断到 6 位（ROUND_HALF_UP 在字符串层面近似处理）
  if (fractionPart.length > 6) {
    const roundDigit = fractionPart[6]!
    fractionPart = fractionPart.slice(0, 6)
    if (roundDigit >= '5') {
      // 进一
      const rounded = (BigInt(fractionPart || '0') + 1n).toString().padStart(6, '0')
      if (rounded.length > 6) {
        // 溢出到整数
        fractionPart = rounded.slice(1)
        integerPart = (BigInt(integerPart) + 1n).toString()
      } else {
        fractionPart = rounded
      }
    }
  }
  // 去掉末尾零
  fractionPart = fractionPart.replace(/0+$/, '')

  // 整数部分加千分位逗号
  const withCommas = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  return sign + withCommas + (fractionPart ? '.' + fractionPart : '')
}

function formatCell(row: Record<string, any>, col: RunResult['columns'][number]): string {
  const v = row[col.code]
  if (v === null || v === undefined || v === '') {
    return NUMERIC_TYPES.has(col.data_type) ? '0' : '—'
  }
  if (NUMERIC_TYPES.has(col.data_type)) {
    // 优先字符串解析（Decimal 从后端来可能是字符串），不丢大数精度
    return formatDecimal(String(v))
  }
  return String(v)
}
</script>

<template>
  <div class="report-preview-table" :class="{ 'is-fill-viewport': fillViewport }">
    <div class="report-table-shell">
      <el-table
        v-loading="loading"
        :data="items"
        stripe
        border
        class="report-result-table"
        style="width: 100%"
        :height="height ?? (fillViewport ? '100%' : undefined)"
        :max-height="height || fillViewport ? undefined : (maxHeight ?? 400)"
      >
        <el-table-column
          v-for="col in columns"
          :key="col.code"
          :label="col.label"
          :prop="col.code"
          min-width="140"
        >
          <template #header>
            {{ col.label }}
            <el-tag
              v-if="col.is_sensitive"
              size="small"
              type="danger"
              effect="plain"
              style="margin-left: 4px"
            >敏感</el-tag>
          </template>
          <template #default="{ row }">
            <span v-if="col.is_sensitive" style="color: var(--color-text-placeholder); font-family: monospace">******</span>
            <span v-else>{{ formatCell(row, col) }}</span>
          </template>
        </el-table-column>
        <template #empty>
          <div style="padding: 32px 0; color: var(--color-text-placeholder); font-size: 13px">
            没有数据匹配当前筛选条件
          </div>
        </template>
      </el-table>
    </div>
    <el-pagination
      class="report-table-pagination"
      :current-page="page"
      :page-size="pageSize"
      :total="total"
      :page-sizes="pageSizes ?? [20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      @current-change="(v: number) => { emit('update:page', v); emit('page-change') }"
      @size-change="(v: number) => { emit('update:pageSize', v); emit('page-change') }"
    />
  </div>
</template>


<style scoped>
.report-preview-table {
  min-width: 0;
}

.report-preview-table.is-fill-viewport {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.report-table-shell {
  min-width: 0;
}

.report-preview-table.is-fill-viewport .report-table-shell {
  flex: 1 1 auto;
  min-height: 0;
}

.report-result-table {
  --el-table-border-color: var(--color-border-light);
}

.report-result-table :deep(.el-table__cell) {
  vertical-align: top;
}

.report-result-table :deep(.cell) {
  white-space: nowrap;
}

.report-result-table :deep(.el-table__header-wrapper) {
  position: relative;
  z-index: 2;
}

.report-table-pagination {
  flex: 0 0 auto;
  justify-content: flex-end;
  margin-top: 12px;
}

.report-preview-table.is-fill-viewport .report-table-pagination {
  margin-top: 0;
  padding: 12px 0 0;
  background: #fff;
}
</style>
