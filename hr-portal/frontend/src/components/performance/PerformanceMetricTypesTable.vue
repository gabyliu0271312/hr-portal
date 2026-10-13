<template>
  <PerformanceManagementTable
    :rows="rows"
    :loading="loading"
    :loading-text="loadingText"
    :empty-text="emptyText"
    table-aria-label="指标类型列表"
    pagination-aria-label="指标类型分页"
    :total="total ?? rows.length"
    :page="page"
    :page-size="pageSize"
    :show-pagination="true"
    @page-change="emit('page-change', $event)"
    @page-size-change="emit('page-size-change', $event)"
  >
    <el-table-column prop="name" label="名称" min-width="300" />
    <el-table-column prop="fields" label="指标字段" min-width="420" />
    <el-table-column label="更新人" min-width="220">
      <template #default="{ row }"><span class="is-muted">{{ row.updatedBy || '--' }}</span></template>
    </el-table-column>
    <el-table-column label="最近更新时间" min-width="300">
      <template #default="{ row }"><span class="is-muted">{{ row.updatedAt || '--' }}</span></template>
    </el-table-column>
    <el-table-column label="操作" width="180" fixed="right">
      <template #default="{ row }">
        <div class="metric-type-actions">
          <PerformanceButton variant="text" size="small" @click="emit('edit', row)">编辑</PerformanceButton>
          <PerformanceButton variant="text" size="small" disabled @click="emit('remove', row)">删除</PerformanceButton>
        </div>
      </template>
    </el-table-column>
  </PerformanceManagementTable>
</template>

<script setup lang="ts">
import PerformanceButton from './PerformanceButton.vue'
import PerformanceManagementTable from './PerformanceManagementTable.vue'

export interface PerformanceMetricTypeRow {
  id: number
  name: string
  fields: string
  fieldIds?: number[]
  updatedBy?: string
  updatedAt?: string
}

withDefaults(defineProps<{
  rows: PerformanceMetricTypeRow[]
  loading?: boolean
  loadingText?: string
  emptyText?: string
  total?: number
  page?: number
  pageSize?: number
}>(), {
  loading: false,
  loadingText: '加载中',
  emptyText: '暂无指标类型',
  page: 1,
  pageSize: 10,
})

const emit = defineEmits<{
  edit: [row: PerformanceMetricTypeRow]
  remove: [row: PerformanceMetricTypeRow]
  'page-change': [page: number]
  'page-size-change': [pageSize: number]
}>()
</script>

<style scoped>
.metric-type-actions { display: inline-flex; align-items: center; gap: var(--spacing-4); }
.metric-type-actions :deep(.performance-button) { min-width: 0; padding-inline: 0; }
.is-muted { color: var(--color-text-placeholder); }
</style>
