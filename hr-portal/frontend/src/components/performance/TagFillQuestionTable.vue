<script setup lang="ts">
import PerformanceManagementTable from './PerformanceManagementTable.vue'
import type { TagFillQuestionRecord } from './tagFillQuestionFixtures'

withDefaults(defineProps<{
  questions: TagFillQuestionRecord[]
  loading?: boolean
  page?: number
  pageSize?: number
  total?: number
}>(), {
  loading: false,
  page: 1,
  pageSize: 10,
})

const emit = defineEmits<{
  edit: [question: TagFillQuestionRecord]
  remove: [question: TagFillQuestionRecord]
  'page-change': [page: number]
  'page-size-change': [pageSize: number]
}>()
</script>

<template>
  <PerformanceManagementTable
    :rows="questions"
    :loading="loading"
    loading-text="正在加载标签型填写题..."
    empty-text="暂无标签型填写题"
    table-aria-label="标签型填写题表格"
    pagination-aria-label="标签型填写题分页"
    :page="page"
    :page-size="pageSize"
    :total="total"
    @page-change="emit('page-change', $event)"
    @page-size-change="emit('page-size-change', $event)"
  >
    <el-table-column prop="name" label="名称" min-width="240" show-overflow-tooltip />
    <el-table-column prop="creator" label="创建人" min-width="320" show-overflow-tooltip />
    <el-table-column prop="createdAt" label="创建时间" min-width="320" />
    <el-table-column prop="remark" label="备注" min-width="240" show-overflow-tooltip />
    <el-table-column label="操作" min-width="160" fixed="right">
      <template #default="{ row }">
        <div class="row-actions">
          <el-button link type="primary" @click="emit('edit', row)">编辑</el-button>
          <el-button link class="delete-button" @click="emit('remove', row)">删除</el-button>
        </div>
      </template>
    </el-table-column>
  </PerformanceManagementTable>
</template>

<style scoped>
.row-actions { display: flex; align-items: center; gap: 4px; }
.delete-button { color: rgb(187, 191, 196); }
:deep(.performance-management-table colgroup col:nth-child(1)) { width: 14.85% !important; }
:deep(.performance-management-table colgroup col:nth-child(2)) { width: 19.79% !important; }
:deep(.performance-management-table colgroup col:nth-child(3)) { width: 19.81% !important; }
:deep(.performance-management-table colgroup col:nth-child(4)) { width: 14.85% !important; }
:deep(.performance-management-table colgroup col:nth-child(5)) { width: 30.70% !important; }
</style>
