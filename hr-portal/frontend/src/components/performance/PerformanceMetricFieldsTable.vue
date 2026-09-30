<template>
  <PerformanceManagementTable
    :rows="rows"
    :loading="loading"
    loading-text="加载中"
    empty-text="暂无指标字段"
    table-aria-label="指标字段列表"
    pagination-aria-label="指标字段分页"
    :page="page"
    :page-size="pageSize"
    :total="total"
    :max-height="maxHeight"
    @page-change="emit('page-change', $event)"
    @page-size-change="emit('page-size-change', $event)"
  >
    <el-table-column prop="displayId" label="ID" width="96" fixed="left">
      <template #default="{ row }">{{ row.displayId ?? row.id }}</template>
    </el-table-column>
    <el-table-column prop="name" label="名称" min-width="240" fixed="left" />
    <el-table-column prop="type" label="类型" min-width="300" />
    <el-table-column prop="updatedBy" label="更新人" min-width="180">
      <template #default="{ row }"><span class="is-muted">{{ row.updatedBy || '--' }}</span></template>
    </el-table-column>
    <el-table-column prop="updatedAt" label="最近更新时间" min-width="220">
      <template #default="{ row }"><span class="is-muted">{{ row.updatedAt || '--' }}</span></template>
    </el-table-column>
    <el-table-column label="操作" width="180" fixed="right">
      <template #default="{ row }">
        <div class="metric-field-actions">
          <PerformanceDisabledReason :disabled="row.isSystem" reason="系统预置字段，不允许编辑" variant="popover">
            <PerformanceButton variant="link" :disabled="actionsDisabled || row.isSystem" @click="!actionsDisabled && !row.isSystem && emit('edit', row)">编辑</PerformanceButton>
          </PerformanceDisabledReason>
          <PerformanceDisabledReason :disabled="row.isSystem || row.inUse" :reason="row.isSystem ? '系统预置字段，不允许删除' : '该字段已被指标类型使用，不允许删除'" variant="popover">
            <PerformanceButton variant="link" :disabled="actionsDisabled || row.isSystem || row.inUse" @click="!actionsDisabled && !row.isSystem && !row.inUse && emit('remove', row)">删除</PerformanceButton>
          </PerformanceDisabledReason>
        </div>
      </template>
    </el-table-column>
  </PerformanceManagementTable>
</template>

<script setup lang="ts">
import PerformanceButton from './PerformanceButton.vue'
import PerformanceDisabledReason from './PerformanceDisabledReason.vue'
import PerformanceManagementTable from './PerformanceManagementTable.vue'

export interface PerformanceMetricFieldRow {
  id: number
  displayId?: number
  name: string
  type: string
  isSystem?: boolean
  inUse?: boolean
  updatedBy?: string
  updatedAt?: string
}

withDefaults(defineProps<{
  rows: PerformanceMetricFieldRow[]
  loading?: boolean
  page?: number
  pageSize?: number
  total?: number
  maxHeight?: number | string
  actionsDisabled?: boolean
}>(), {
  loading: false,
  page: 1,
  pageSize: 10,
  total: undefined,
  maxHeight: undefined,
  actionsDisabled: true,
})

const emit = defineEmits<{
  'page-change': [page: number]
  'page-size-change': [pageSize: number]
  edit: [row: PerformanceMetricFieldRow]
  remove: [row: PerformanceMetricFieldRow]
}>()
</script>

<style scoped>
.metric-field-actions { display: inline-flex; align-items: center; gap: var(--spacing-4); }
.is-muted { color: var(--color-text-placeholder); }
</style>
