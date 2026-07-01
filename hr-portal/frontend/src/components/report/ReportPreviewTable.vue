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

function formatCell(row: Record<string, any>, col: RunResult['columns'][number]): string {
  const v = row[col.code]
  if (v === null || v === undefined || v === '') {
    return col.data_type === 'number' || col.data_type === 'integer' ? '0' : '—'
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
